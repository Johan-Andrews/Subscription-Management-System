const { query, withTransaction } = require('../../db/pool');
const { badRequest, conflict, notFound } = require('../../lib/errors');

const planFields = `
  id,
  name,
  price,
  billing_period,
  min_qty,
  available_from,
  available_to,
  auto_close,
  closable,
  pausable,
  renewable,
  is_active,
  created_at,
  updated_at
`;

function planFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    billingPeriod: row.billing_period,
    minQty: row.min_qty,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    autoClose: row.auto_close,
    closable: row.closable,
    pausable: row.pausable,
    renewable: row.renewable,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPlans({ availableOnly = false, search, billingPeriod, limit, offset }) {
  const filters = [];
  const values = [];
  if (availableOnly) {
    filters.push('is_active = true');
    filters.push('(available_from IS NULL OR available_from <= CURRENT_DATE)');
    filters.push('(available_to IS NULL OR available_to >= CURRENT_DATE)');
  }
  if (search) {
    values.push(`%${search}%`);
    filters.push(`name ILIKE $${values.length}`);
  }
  if (billingPeriod) {
    values.push(billingPeriod);
    filters.push(`billing_period = $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const limitPlaceholder = values.length + 1;
  const offsetPlaceholder = values.length + 2;
  const pageValues = [...values, limit, offset];

  const [plansResult, countResult] = await Promise.all([
    query(
      `SELECT ${planFields}
       FROM plans
       ${where}
       ORDER BY name ASC, id ASC
       LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
      pageValues
    ),
    query(`SELECT COUNT(*) FROM plans ${where}`, values),
  ]);
  return {
    plans: plansResult.rows.map(planFromRow),
    total: countResult.rows[0].count,
  };
}

async function getPlan(id) {
  const result = await query(
    `SELECT ${planFields} FROM plans WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw notFound('Plan not found');
  }
  return planFromRow(result.rows[0]);
}

async function createPlan(plan) {
  const result = await query(
    `INSERT INTO plans (
       name, price, billing_period, min_qty, available_from, available_to,
       auto_close, closable, pausable, renewable, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${planFields}`,
    [
      plan.name,
      plan.price,
      plan.billingPeriod,
      plan.minQty,
      plan.availableFrom,
      plan.availableTo,
      plan.autoClose,
      plan.closable,
      plan.pausable,
      plan.renewable,
      plan.isActive,
    ]
  );
  return planFromRow(result.rows[0]);
}

async function updatePlan(id, updates) {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT id, available_from, available_to
       FROM plans
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (currentResult.rows.length === 0) {
      throw notFound('Plan not found');
    }

    const current = currentResult.rows[0];
    const availableFrom = Object.prototype.hasOwnProperty.call(updates, 'availableFrom')
      ? updates.availableFrom
      : current.available_from;
    const availableTo = Object.prototype.hasOwnProperty.call(updates, 'availableTo')
      ? updates.availableTo
      : current.available_to;
    if (availableFrom && availableTo && availableTo < availableFrom) {
      throw badRequest('Availability end date must be on or after the start date');
    }

    const columns = {
      name: 'name',
      price: 'price',
      billingPeriod: 'billing_period',
      minQty: 'min_qty',
      availableFrom: 'available_from',
      availableTo: 'available_to',
      autoClose: 'auto_close',
      closable: 'closable',
      pausable: 'pausable',
      renewable: 'renewable',
      isActive: 'is_active',
    };
    const values = [];
    const assignments = Object.entries(updates).map(([field, value]) => {
      values.push(value);
      return `${columns[field]} = $${values.length}`;
    });
    values.push(id);

    const result = await client.query(
      `UPDATE plans
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING ${planFields}`,
      values
    );
    return planFromRow(result.rows[0]);
  });
}

async function deletePlan(id) {
  const result = await query(
    `DELETE FROM plans WHERE id = $1 RETURNING id, name`,
    [id]
  );
  if (result.rows.length === 0) {
    throw notFound('Plan not found');
  }
  return result.rows[0];
}

function mapPlanDatabaseError(error) {
  if (error.code === '23503') {
    throw conflict('This plan is in use by subscriptions or quotations. Deactivate it by setting isActive to false instead.');
  }
  throw error;
}

module.exports = {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  mapPlanDatabaseError,
};
