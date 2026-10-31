const { query, withTransaction } = require('../../db/pool');
const { badRequest, notFound, conflict, forbidden } = require('../../lib/errors');
const { parsePaging, pageResult } = require('../../lib/pagination');
const { sendMail } = require('../../lib/mailer');
const { generateInvoicePdfBuffer } = require('./pdf.service');

/**
 * List invoices with filters and pagination
 */
async function listInvoices({ user, filters = {}, paging = {} }) {
  const { page, pageSize, limit, offset } = parsePaging(paging);
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  // Role based filtering: Customers see only their own CONFIRMED or PAID invoices
  if (user.role === 'CUSTOMER') {
    if (!user.customerId) {
      return pageResult([], page, pageSize, 0);
    }
    conditions.push(`i.customer_id = $${paramIdx++}`);
    params.push(user.customerId);

    if (filters.status && ['CONFIRMED', 'PAID'].includes(filters.status.toUpperCase())) {
      conditions.push(`i.status = $${paramIdx++}`);
      params.push(filters.status.toUpperCase());
    } else {
      conditions.push(`i.status IN ('CONFIRMED', 'PAID')`);
    }
  } else {
    // Admin / Staff filters
    if (filters.customerId) {
      conditions.push(`i.customer_id = $${paramIdx++}`);
      params.push(filters.customerId);
    }
    if (filters.status) {
      conditions.push(`i.status = $${paramIdx++}`);
      params.push(filters.status.toUpperCase());
    }
  }

  if (filters.subscriptionId) {
    conditions.push(`i.subscription_id = $${paramIdx++}`);
    params.push(filters.subscriptionId);
  }

  if (filters.from) {
    conditions.push(`i.issue_date >= $${paramIdx++}`);
    params.push(filters.from);
  }

  if (filters.to) {
    conditions.push(`i.issue_date <= $${paramIdx++}`);
    params.push(filters.to);
  }

  const isOverdueFilter = String(filters.overdue).toLowerCase() === 'true' || filters.overdue === true || filters.overdue === '1';
  if (isOverdueFilter) {
    conditions.push(`i.status = 'CONFIRMED' AND i.due_date < CURRENT_DATE`);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(`(i.number ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx})`);
    params.push(term);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching
  const countSql = `
    SELECT count(*)::integer AS total
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    ${whereClause}
  `;
  const countRes = await query(countSql, params);
  const total = countRes.rows[0]?.total || 0;

  // Fetch paginated rows with computed overdue fields
  const dataSql = `
    SELECT
      i.id,
      i.number,
      i.subscription_id,
      i.customer_id,
      i.period_start,
      i.period_end,
      i.issue_date,
      i.due_date,
      i.subtotal,
      i.discount_total,
      i.tax_total,
      i.total,
      i.amount_paid,
      i.status,
      i.sent_at,
      i.confirmed_at,
      i.paid_at,
      i.cancelled_at,
      i.created_at,
      i.updated_at,
      c.name AS customer_name,
      c.email AS customer_email,
      c.company AS customer_company,
      s.number AS subscription_number,
      (i.status = 'CONFIRMED' AND i.due_date < CURRENT_DATE) AS is_overdue,
      CASE
        WHEN i.status = 'CONFIRMED' AND i.due_date < CURRENT_DATE
        THEN (CURRENT_DATE - i.due_date)::integer
        ELSE 0
      END AS days_overdue,
      CASE
        WHEN i.status = 'CANCELLED' THEN 0
        ELSE GREATEST(0, (i.total - i.amount_paid))
      END AS outstanding_balance
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN subscriptions s ON s.id = i.subscription_id
    ${whereClause}
    ORDER BY i.issue_date DESC, i.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  const dataRes = await query(dataSql, [...params, limit, offset]);

  return pageResult(dataRes.rows, page, pageSize, total);
}

/**
 * Get single invoice with full details (lines, discounts, payments)
 */
async function getInvoiceById({ id, user }) {
  if (!id) throw badRequest('Invoice ID is required');

  const invSql = `
    SELECT
      i.id,
      i.number,
      i.subscription_id,
      i.customer_id,
      i.period_start,
      i.period_end,
      i.issue_date,
      i.due_date,
      i.subtotal,
      i.discount_total,
      i.tax_total,
      i.total,
      i.amount_paid,
      i.status,
      i.sent_at,
      i.confirmed_at,
      i.paid_at,
      i.cancelled_at,
      i.created_at,
      i.updated_at,
      c.id AS customer_id,
      c.name AS customer_name,
      c.email AS customer_email,
      c.phone AS customer_phone,
      c.company AS customer_company,
      c.address AS customer_address,
      s.number AS subscription_number,
      (i.status = 'CONFIRMED' AND i.due_date < CURRENT_DATE) AS is_overdue,
      CASE
        WHEN i.status = 'CONFIRMED' AND i.due_date < CURRENT_DATE
        THEN (CURRENT_DATE - i.due_date)::integer
        ELSE 0
      END AS days_overdue,
      CASE
        WHEN i.status = 'CANCELLED' THEN 0
        ELSE GREATEST(0, (i.total - i.amount_paid))
      END AS outstanding_balance
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN subscriptions s ON s.id = i.subscription_id
    WHERE i.id = $1
  `;
  const invRes = await query(invSql, [id]);

  if (invRes.rows.length === 0) {
    throw notFound('Invoice not found');
  }

  const raw = invRes.rows[0];

  // Ownership enforcement for CUSTOMER role
  if (user && user.role === 'CUSTOMER') {
    if (raw.customer_id !== user.customerId || !['CONFIRMED', 'PAID'].includes(raw.status)) {
      throw notFound('Invoice not found');
    }
  }

  // Fetch invoice lines
  const linesSql = `
    SELECT
      il.id,
      il.invoice_id,
      il.product_id,
      il.description,
      il.quantity,
      il.unit_price,
      il.discount_amount,
      il.tax_rate,
      il.tax_type,
      il.tax_amount,
      il.amount,
      p.name AS product_name
    FROM invoice_lines il
    LEFT JOIN products p ON p.id = il.product_id
    WHERE il.invoice_id = $1
    ORDER BY il.id ASC
  `;
  const linesRes = await query(linesSql, [id]);

  // Fetch invoice discounts
  const discountsSql = `
    SELECT id, invoice_id, discount_id, name, amount
    FROM invoice_discounts
    WHERE invoice_id = $1
    ORDER BY id ASC
  `;
  const discountsRes = await query(discountsSql, [id]);

  // Fetch payments
  const paymentsConditions = ['p.invoice_id = $1'];
  if (user && user.role === 'CUSTOMER') {
    paymentsConditions.push("p.status = 'COMPLETED'");
  }
  const paymentsSql = `
    SELECT
      p.id,
      p.invoice_id,
      p.method,
      p.amount,
      p.paid_on,
      p.note,
      p.source,
      p.status,
      p.void_reason,
      p.created_at
    FROM payments p
    WHERE ${paymentsConditions.join(' AND ')}
    ORDER BY p.paid_on DESC, p.created_at DESC
  `;
  const paymentsRes = await query(paymentsSql, [id]);

  const invoice = {
    ...raw,
    customer: {
      id: raw.customer_id,
      name: raw.customer_name,
      email: raw.customer_email,
      phone: raw.customer_phone,
      company: raw.customer_company,
      address: raw.customer_address,
    },
    lines: linesRes.rows,
    discounts: discountsRes.rows,
    payments: paymentsRes.rows,
  };

  return invoice;
}

/**
 * Confirm a draft invoice (DRAFT -> CONFIRMED)
 */
async function confirmInvoice({ id }) {
  if (!id) throw badRequest('Invoice ID is required');

  const check = await query('SELECT id, status FROM invoices WHERE id = $1', [id]);
  if (check.rows.length === 0) {
    throw notFound('Invoice not found');
  }

  const currentStatus = check.rows[0].status;
  if (currentStatus !== 'DRAFT') {
    throw conflict(`Cannot confirm invoice with status ${currentStatus}. Only DRAFT invoices can be confirmed.`);
  }

  const updateSql = `
    UPDATE invoices
    SET status = 'CONFIRMED',
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const res = await query(updateSql, [id]);
  return res.rows[0];
}

/**
 * Confirm invoices in bulk (all DRAFT, or given ids)
 */
async function confirmBulkInvoices({ ids } = {}) {
  let updateSql;
  let params = [];

  if (Array.isArray(ids) && ids.length > 0) {
    updateSql = `
      UPDATE invoices
      SET status = 'CONFIRMED',
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE status = 'DRAFT' AND id = ANY($1::uuid[])
      RETURNING id, number
    `;
    params = [ids];
  } else {
    updateSql = `
      UPDATE invoices
      SET status = 'CONFIRMED',
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE status = 'DRAFT'
      RETURNING id, number
    `;
  }

  const res = await query(updateSql, params);
  return {
    confirmedCount: res.rowCount,
    confirmedIds: res.rows.map((r) => r.id),
  };
}

/**
 * Cancel an invoice (not allowed if it has COMPLETED payments)
 */
async function cancelInvoice({ id }) {
  if (!id) throw badRequest('Invoice ID is required');

  const check = await query('SELECT id, status FROM invoices WHERE id = $1', [id]);
  if (check.rows.length === 0) {
    throw notFound('Invoice not found');
  }

  const currentStatus = check.rows[0].status;
  if (currentStatus === 'CANCELLED') {
    throw conflict('Invoice is already cancelled');
  }
  if (currentStatus === 'PAID') {
    throw conflict('Cannot cancel an invoice that is already PAID');
  }

  // Check for completed payments
  const payCheck = await query(
    `SELECT count(*)::integer AS count FROM payments WHERE invoice_id = $1 AND status = 'COMPLETED'`,
    [id]
  );
  if (payCheck.rows[0]?.count > 0) {
    throw conflict('Cannot cancel an invoice with completed payments');
  }

  const updateSql = `
    UPDATE invoices
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const res = await query(updateSql, [id]);
  return res.rows[0];
}

/**
 * Send invoice PDF to customer via email
 * (If DRAFT, auto-confirms before sending)
 */
async function sendInvoiceEmail({ id, user }) {
  const invoice = await getInvoiceById({ id, user: { role: 'ADMIN' } });

  if (invoice.status === 'CANCELLED') {
    throw conflict('Cannot send a cancelled invoice');
  }

  // If DRAFT, auto-confirm on send
  if (invoice.status === 'DRAFT') {
    await query(
      `UPDATE invoices SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    invoice.status = 'CONFIRMED';
  }

  if (!invoice.customer || !invoice.customer.email) {
    throw badRequest('Customer does not have a registered email address');
  }

  const pdfBuffer = await generateInvoicePdfBuffer(invoice);

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #181B25;">
      <div style="background-color: #0A2A66; padding: 18px 24px; border-radius: 8px 8px 0 0; color: #FFFFFF;">
        <h2 style="margin: 0; font-size: 20px;">Brightloop Software</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #A8F0E0;">Invoice ${invoice.number}</p>
      </div>
      <div style="border: 1px solid #E1E5EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px; background: #FFFFFF;">
        <p>Dear ${invoice.customer.name},</p>
        <p>Please find attached your invoice <strong>${invoice.number}</strong> for the billing period <strong>${invoice.period_start}</strong> to <strong>${invoice.period_end}</strong>.</p>
        <div style="background: #F8FAFC; border: 1px solid #E1E5EB; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="color: #5C667A; padding: 4px 0;">Invoice Amount:</td>
              <td style="font-weight: bold; text-align: right; padding: 4px 0;">INR ${Number(invoice.total).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color: #5C667A; padding: 4px 0;">Due Date:</td>
              <td style="text-align: right; padding: 4px 0;">${invoice.due_date}</td>
            </tr>
            <tr>
              <td style="color: #5C667A; padding: 4px 0;">Status:</td>
              <td style="text-align: right; padding: 4px 0; font-weight: bold; color: #0B5CFF;">${invoice.status}</td>
            </tr>
          </table>
        </div>
        <p>A PDF copy is attached to this email for your records.</p>
        <p style="margin-top: 28px; font-size: 13px; color: #5C667A;">Best regards,<br/>Brightloop Team</p>
      </div>
    </div>
  `;

  await sendMail({
    to: invoice.customer.email,
    subject: `Invoice ${invoice.number} from Brightloop`,
    html: emailHtml,
    attachments: [
      {
        filename: `${invoice.number}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  const updateRes = await query(
    `UPDATE invoices SET sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );

  return {
    sent: true,
    sentAt: updateRes.rows[0].sent_at,
    invoice: updateRes.rows[0],
  };
}

module.exports = {
  listInvoices,
  getInvoiceById,
  confirmInvoice,
  confirmBulkInvoices,
  cancelInvoice,
  sendInvoiceEmail,
};
