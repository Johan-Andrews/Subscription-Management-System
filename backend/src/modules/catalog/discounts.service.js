const { query, withTransaction } = require('../../db/pool');
const { badRequest, conflict, notFound } = require('../../lib/errors');

const discountFields = `
  id,
  name,
  type,
  value,
  min_purchase,
  min_qty,
  start_date,
  end_date,
  usage_limit,
  times_used,
  scope,
  is_active,
  created_at,
  updated_at,
  CASE
    WHEN NOT is_active THEN 'DISABLED'
    WHEN start_date > CURRENT_DATE THEN 'UPCOMING'
    WHEN end_date < CURRENT_DATE THEN 'EXPIRED'
    WHEN usage_limit IS NOT NULL AND times_used >= usage_limit THEN 'EXHAUSTED'
    ELSE 'ACTIVE'
  END AS status
`;

function discountFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: row.value,
    minPurchase: row.min_purchase,
    minQty: row.min_qty,
    startDate: row.start_date,
    endDate: row.end_date,
    usageLimit: row.usage_limit,
    timesUsed: row.times_used,
    scope: row.scope,
    isActive: row.is_active,
    status: row.status,
    productIds: row.product_ids || [],
    products: row.products || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function productAggregate(alias = 'd') {
  return `COALESCE(
    (
      SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name, p.id)
      FROM discount_products dp
      JOIN products p ON p.id = dp.product_id
      WHERE dp.discount_id = ${alias}.id
    ),
    '[]'::json
  ) AS products,
  COALESCE(
    (
      SELECT array_agg(dp.product_id ORDER BY dp.product_id)
      FROM discount_products dp
      WHERE dp.discount_id = ${alias}.id
    ),
    ARRAY[]::uuid[]
  ) AS product_ids`;
}

async function listDiscounts({ limit, offset }) {
  const [discountsResult, countResult] = await Promise.all([
    query(
      `SELECT ${discountFields}, ${productAggregate()}
       FROM discounts d
       ORDER BY d.created_at DESC, d.id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query('SELECT COUNT(*) FROM discounts'),
  ]);
  return {
    discounts: discountsResult.rows.map(discountFromRow),
    total: countResult.rows[0].count,
  };
}

async function getDiscount(id) {
  const result = await query(
    `SELECT ${discountFields}, ${productAggregate()}
     FROM discounts d
     WHERE d.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw notFound('Discount not found');
  }
  return discountFromRow(result.rows[0]);
}

async function insertProducts(client, discountId, productIds) {
  if (!productIds.length) return;
  const result = await client.query(
    `SELECT id FROM products WHERE id = ANY($1::uuid[])`,
    [productIds]
  );
  if (result.rows.length !== productIds.length) {
    throw badRequest('One or more selected products could not be found');
  }
  await client.query(
    `INSERT INTO discount_products (discount_id, product_id)
     SELECT $1, unnest($2::uuid[])`,
    [discountId, productIds]
  );
}

async function createDiscount(discount) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO discounts (
         name, type, value, min_purchase, min_qty, start_date, end_date,
         usage_limit, scope, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        discount.name,
        discount.type,
        discount.value,
        discount.minPurchase,
        discount.minQty,
        discount.startDate,
        discount.endDate,
        discount.usageLimit,
        discount.scope,
        discount.isActive,
      ]
    );
    if (discount.scope === 'PRODUCT') {
      await insertProducts(client, result.rows[0].id, discount.productIds);
    }

    return getDiscountUsingClient(client, result.rows[0].id);
  });
}

async function getDiscountUsingClient(client, id) {
  const result = await client.query(
    `SELECT ${discountFields}, ${productAggregate()}
     FROM discounts d
     WHERE d.id = $1`,
    [id]
  );
  return discountFromRow(result.rows[0]);
}

async function updateDiscount(id, updates) {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT id, name, type, value, min_purchase, min_qty, start_date,
              end_date, usage_limit, scope, is_active
       FROM discounts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (currentResult.rows.length === 0) {
      throw notFound('Discount not found');
    }
    const current = currentResult.rows[0];
    const currentProducts = await client.query(
      'SELECT product_id FROM discount_products WHERE discount_id = $1',
      [id]
    );
    const productIds = Object.prototype.hasOwnProperty.call(updates, 'productIds')
      ? updates.productIds
      : currentProducts.rows.map((row) => row.product_id);
    const scope = updates.scope || current.scope;
    if (scope === 'PRODUCT' && productIds.length === 0) {
      throw badRequest('Select at least one product for a product-scoped discount');
    }

    const merged = {
      ...current,
      ...updates,
      startDate: Object.prototype.hasOwnProperty.call(updates, 'startDate')
        ? updates.startDate
        : current.start_date,
      endDate: Object.prototype.hasOwnProperty.call(updates, 'endDate')
        ? updates.endDate
        : current.end_date,
    };
    if (merged.startDate && merged.endDate && merged.endDate < merged.startDate) {
      throw badRequest('Discount end date must be on or after the start date');
    }
    if (merged.type === 'PERCENT' && Number(merged.value) > 100) {
      throw badRequest('Percentage discount cannot exceed 100');
    }

    const columns = {
      name: 'name',
      type: 'type',
      value: 'value',
      minPurchase: 'min_purchase',
      minQty: 'min_qty',
      startDate: 'start_date',
      endDate: 'end_date',
      usageLimit: 'usage_limit',
      scope: 'scope',
      isActive: 'is_active',
    };
    const values = [];
    const assignments = Object.entries(updates)
      .filter(([field]) => field !== 'productIds')
      .map(([field, value]) => {
        values.push(value);
        return `${columns[field]} = $${values.length}`;
      });

    if (assignments.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE discounts
         SET ${assignments.join(', ')}, updated_at = now()
         WHERE id = $${values.length}`,
        values
      );
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'productIds') || updates.scope === 'SUBSCRIPTION') {
      await client.query('DELETE FROM discount_products WHERE discount_id = $1', [id]);
      if (scope === 'PRODUCT') {
        await insertProducts(client, id, productIds);
      }
    }

    return getDiscountUsingClient(client, id);
  });
}

async function deleteDiscount(id) {
  const result = await query(
    `DELETE FROM discounts WHERE id = $1 RETURNING id, name`,
    [id]
  );
  if (result.rows.length === 0) {
    throw notFound('Discount not found');
  }
  return result.rows[0];
}

function mapDiscountDatabaseError(error) {
  if (error.code === '23503') {
    throw conflict('This discount is attached to invoices and cannot be deleted. Deactivate it instead.');
  }
  throw error;
}

module.exports = {
  listDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  mapDiscountDatabaseError,
};
