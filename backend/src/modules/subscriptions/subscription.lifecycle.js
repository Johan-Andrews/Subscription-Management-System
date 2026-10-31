const { notFound, conflict, forbidden, badRequest } = require('../../lib/errors');

/**
 * Allowed transitions mapping for subscription lifecycle
 */
const ALLOWED_TRANSITIONS = {
  send_quotation: {
    from: ['DRAFT'],
    to: 'QUOTATION',
    roles: ['ADMIN', 'STAFF'],
  },
  confirm: {
    from: ['QUOTATION'],
    to: 'CONFIRMED',
    roles: ['ADMIN', 'STAFF'],
  },
  activate: {
    from: ['CONFIRMED'],
    to: 'ACTIVE',
    roles: ['ADMIN', 'STAFF'],
  },
  close: {
    from: ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE'],
    to: 'CLOSED',
    roles: ['ADMIN', 'STAFF', 'CUSTOMER'],
  },
  pause: {
    from: ['ACTIVE'],
    to: 'ACTIVE', // status remains ACTIVE, is_paused becomes true
    roles: ['ADMIN', 'STAFF', 'CUSTOMER'],
  },
  resume: {
    from: ['ACTIVE'],
    to: 'ACTIVE', // status remains ACTIVE, is_paused becomes false
    roles: ['ADMIN', 'STAFF', 'CUSTOMER'],
  },
  renew: {
    from: ['ACTIVE', 'CLOSED'],
    to: 'ACTIVE',
    roles: ['ADMIN', 'STAFF', 'CUSTOMER'],
  },
};

/**
 * Normalizes action string (e.g. 'send-quotation' -> 'send_quotation')
 */
function normalizeAction(action) {
  return String(action).toLowerCase().replace(/-/g, '_');
}

/**
 * Helper to compute period in days or date offset
 */
function addPeriod(startDate, period) {
  const d = new Date(startDate);
  switch (period) {
    case 'DAILY':
      d.setDate(d.getDate() + 1);
      break;
    case 'WEEKLY':
      d.setDate(d.getDate() + 7);
      break;
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'YEARLY':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

/**
 * Executes a lifecycle transition inside a pg client transaction
 * @param {import('pg').PoolClient} client
 * @param {string} id - subscription UUID
 * @param {string} rawAction - action name
 * @param {object} user - authenticated req.user
 * @returns {Promise<object>} updated subscription
 */
async function transition(client, id, rawAction, user) {
  const action = normalizeAction(rawAction);
  const rule = ALLOWED_TRANSITIONS[action];

  if (!rule) {
    throw badRequest(`Unknown lifecycle action: "${rawAction}"`);
  }

  // 1. Fetch and lock subscription with its plan
  const subRes = await client.query(
    `SELECT
      s.*,
      p.billing_period,
      p.auto_close AS plan_auto_close,
      p.closable AS plan_closable,
      p.pausable AS plan_pausable,
      p.renewable AS plan_renewable,
      qt.validity_days AS template_validity_days
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    LEFT JOIN quotation_templates qt ON qt.id = s.template_id
    WHERE s.id = $1
    FOR UPDATE OF s`,
    [id]
  );

  if (subRes.rows.length === 0) {
    throw notFound('Subscription not found');
  }

  const sub = subRes.rows[0];

  // 2. Customer permission and ownership check
  if (user.role === 'CUSTOMER') {
    if (sub.customer_id !== user.customerId) {
      throw notFound('Subscription not found');
    }
    const customerAllowedActions = ['close', 'pause', 'resume', 'renew'];
    if (!customerAllowedActions.includes(action)) {
      throw forbidden(`Customers are not permitted to perform action "${rawAction}"`);
    }
  } else if (!rule.roles.includes(user.role)) {
    throw forbidden(`Role "${user.role}" cannot perform action "${rawAction}"`);
  }

  // 3. Status validation
  if (!rule.from.includes(sub.status)) {
    throw conflict(
      `Cannot perform action "${rawAction}" on subscription in "${sub.status}" status (expected: ${rule.from.join(', ')})`
    );
  }

  const fromStatus = sub.status;
  let toStatus = rule.to;
  let newIsPaused = sub.is_paused;
  let newNextBillingDate = sub.next_billing_date;
  let newExpiryDate = sub.expiry_date;
  let newClosedAt = sub.closed_at;
  let newQuotationValidUntil = sub.quotation_valid_until;

  // 4. Action-specific business rules
  switch (action) {
    case 'send_quotation': {
      // If quotation_valid_until is not set or in the past, set to today + validity_days
      const today = new Date();
      const validDays = sub.template_validity_days || 30;
      const validUntil = new Date(today);
      validUntil.setDate(validUntil.getDate() + validDays);
      newQuotationValidUntil = validUntil.toISOString().split('T')[0];
      break;
    }

    case 'confirm': {
      // on confirm: set next_billing_date = start_date
      newNextBillingDate = sub.start_date;
      break;
    }

    case 'activate': {
      // require CONFIRMED (already checked via rule.from: ['CONFIRMED'])
      if (sub.status !== 'CONFIRMED') {
        throw conflict(`Cannot activate subscription in "${sub.status}" status; requires CONFIRMED`);
      }
      if (!newNextBillingDate) {
        newNextBillingDate = sub.start_date;
      }
      break;
    }

    case 'close': {
      // Early close check
      const today = new Date().toISOString().split('T')[0];
      const isEarly = sub.status === 'ACTIVE' && (!sub.expiry_date || sub.expiry_date > today);
      if (isEarly && !sub.plan_closable) {
        throw forbidden('This plan does not allow early closing');
      }
      newClosedAt = new Date().toISOString();
      break;
    }

    case 'pause': {
      if (!sub.plan_pausable) {
        throw forbidden('This plan does not allow pausing');
      }
      if (sub.is_paused) {
        throw conflict('Subscription is already paused');
      }
      newIsPaused = true;
      break;
    }

    case 'resume': {
      if (!sub.is_paused) {
        throw conflict('Subscription is not paused');
      }
      newIsPaused = false;
      break;
    }

    case 'renew': {
      if (!sub.plan_renewable) {
        throw forbidden('This plan does not allow renewal');
      }

      // Calculate term duration to extend
      let termDays = 30;
      if (sub.expiry_date && sub.start_date) {
        const startMs = new Date(sub.start_date).getTime();
        const expiryMs = new Date(sub.expiry_date).getTime();
        termDays = Math.max(1, Math.round((expiryMs - startMs) / (1000 * 60 * 60 * 24)));
      } else {
        // Fallback term based on billing period
        switch (sub.billing_period) {
          case 'DAILY':
            termDays = 1;
            break;
          case 'WEEKLY':
            termDays = 7;
            break;
          case 'MONTHLY':
            termDays = 30;
            break;
          case 'YEARLY':
            termDays = 365;
            break;
        }
      }

      const baseExpiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date();
      const extendedExpiry = new Date(baseExpiry);
      extendedExpiry.setDate(extendedExpiry.getDate() + termDays);
      newExpiryDate = extendedExpiry.toISOString().split('T')[0];

      // If closed by expiry, reopen to ACTIVE and recompute next_billing_date
      if (sub.status === 'CLOSED') {
        toStatus = 'ACTIVE';
        newClosedAt = null;
        const todayStr = new Date().toISOString().split('T')[0];
        if (!newNextBillingDate || newNextBillingDate < todayStr) {
          newNextBillingDate = todayStr;
        }
      }
      break;
    }
  }

  // 5. Update subscription record
  const updateSql = `
    UPDATE subscriptions
    SET
      status = $1,
      is_paused = $2,
      next_billing_date = $3,
      expiry_date = $4,
      closed_at = $5,
      quotation_valid_until = $6,
      updated_at = now()
    WHERE id = $7
    RETURNING *
  `;
  const updateRes = await client.query(updateSql, [
    toStatus,
    newIsPaused,
    newNextBillingDate,
    newExpiryDate,
    newClosedAt,
    newQuotationValidUntil,
    id,
  ]);
  const updatedSub = updateRes.rows[0];

  // 6. Record status history entry
  await client.query(
    `INSERT INTO subscription_status_history (
      subscription_id,
      from_status,
      to_status,
      action,
      changed_by
    ) VALUES ($1, $2, $3, $4, $5)`,
    [id, fromStatus, toStatus, action, user.id]
  );

  return updatedSub;
}

module.exports = {
  ALLOWED_TRANSITIONS,
  transition,
};
