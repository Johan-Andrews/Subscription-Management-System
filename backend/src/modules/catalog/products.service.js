const { query, withTransaction } = require('../../db/pool');
const { conflict, notFound } = require('../../lib/errors');

const productFields = `
  p.id,
  p.name,
  p.type,
  p.sales_price,
  p.cost_price,
  p.notes,
  p.tax_id,
  p.is_active,
  p.created_at,
  p.updated_at,
  CASE
    WHEN t.id IS NULL THEN NULL
    ELSE json_build_object(
      'id', t.id,
      'name', t.name,
      'type', t.type,
      'rate', t.rate,
      'isActive', t.is_active
    )
  END AS tax,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', v.id,
          'productId', v.product_id,
          'attribute', v.attribute,
          'value', v.value,
          'extraPrice', v.extra_price
        )
        ORDER BY v.attribute, v.value
      )
      FROM product_variants v
      WHERE v.product_id = p.id
    ),
    '[]'::json
  ) AS variants
`;

const productFromRow = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  salesPrice: row.sales_price,
  costPrice: row.cost_price,
  notes: row.notes,
  taxId: row.tax_id,
  tax: row.tax,
  isActive: row.is_active,
  variants: row.variants,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function findActiveTax(client, taxId) {
  if (taxId === null || taxId === undefined) return;

  const result = await client.query(
    'SELECT id FROM taxes WHERE id = $1 AND is_active = true',
    [taxId]
  );
  if (result.rows.length === 0) {
    throw notFound('Active tax not found');
  }
}

async function insertVariants(client, productId, variants) {
  for (const variant of variants) {
    await client.query(
      `INSERT INTO product_variants (product_id, attribute, value, extra_price)
       VALUES ($1, $2, $3, $4)`,
      [productId, variant.attribute, variant.value, variant.extraPrice]
    );
  }
}

async function syncVariants(client, productId, variants) {
  for (const variant of variants) {
    await client.query(
      `INSERT INTO product_variants (product_id, attribute, value, extra_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, attribute, value)
       DO UPDATE SET extra_price = EXCLUDED.extra_price`,
      [productId, variant.attribute, variant.value, variant.extraPrice]
    );
  }

  const attributes = variants.map(({ attribute }) => attribute);
  const values = variants.map(({ value }) => value);
  const obsolete = await client.query(
    `SELECT v.id
     FROM product_variants v
     WHERE v.product_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM unnest($2::text[], $3::text[]) AS desired(attribute, value)
         WHERE desired.attribute = v.attribute AND desired.value = v.value
       )
       AND (
         EXISTS (SELECT 1 FROM subscription_lines sl WHERE sl.variant_id = v.id)
         OR EXISTS (SELECT 1 FROM quotation_template_lines ql WHERE ql.variant_id = v.id)
       )
     LIMIT 1`,
    [productId, attributes, values]
  );

  if (obsolete.rows.length > 0) {
    throw conflict('A variant in use cannot be removed. Remove it from quotations and subscriptions first.');
  }

  await client.query(
    `DELETE FROM product_variants v
     WHERE v.product_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM unnest($2::text[], $3::text[]) AS desired(attribute, value)
         WHERE desired.attribute = v.attribute AND desired.value = v.value
       )`,
    [productId, attributes, values]
  );
}

async function listProducts({ search, type, limit, offset }) {
  const filters = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    filters.push(`p.name ILIKE $${values.length}`);
  }
  if (type) {
    values.push(type);
    filters.push(`p.type = $${values.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [productsResult, countResult] = await Promise.all([
    query(
      `SELECT ${productFields}
       FROM products p
       LEFT JOIN taxes t ON t.id = p.tax_id
       ${where}
       ORDER BY p.name ASC, p.id ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM products p ${where}`,
      values
    ),
  ]);

  return {
    products: productsResult.rows.map(productFromRow),
    total: countResult.rows[0].count,
  };
}

async function getProduct(id) {
  const result = await query(
    `SELECT ${productFields}
     FROM products p
     LEFT JOIN taxes t ON t.id = p.tax_id
     WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw notFound('Product not found');
  }
  return productFromRow(result.rows[0]);
}

async function createProduct(product) {
  return withTransaction(async (client) => {
    await findActiveTax(client, product.taxId);
    const result = await client.query(
      `INSERT INTO products
         (name, type, sales_price, cost_price, notes, tax_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        product.name,
        product.type,
        product.salesPrice,
        product.costPrice,
        product.notes,
        product.taxId,
        product.isActive,
      ]
    );

    await insertVariants(client, result.rows[0].id, product.variants);
    const created = await client.query(
      `SELECT ${productFields}
       FROM products p
       LEFT JOIN taxes t ON t.id = p.tax_id
       WHERE p.id = $1`,
      [result.rows[0].id]
    );
    return productFromRow(created.rows[0]);
  });
}

async function updateProduct(id, updates) {
  return withTransaction(async (client) => {
    const current = await client.query(
      'SELECT id, tax_id FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (current.rows.length === 0) {
      throw notFound('Product not found');
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, 'taxId')
      && updates.taxId !== current.rows[0].tax_id
    ) {
      await findActiveTax(client, updates.taxId);
    }

    const columns = {
      name: 'name',
      type: 'type',
      salesPrice: 'sales_price',
      costPrice: 'cost_price',
      notes: 'notes',
      taxId: 'tax_id',
      isActive: 'is_active',
    };
    const values = [];
    const assignments = Object.entries(updates)
      .filter(([field]) => field !== 'variants')
      .map(([field, value]) => {
        values.push(value);
        return `${columns[field]} = $${values.length}`;
      });

    if (assignments.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE products
         SET ${assignments.join(', ')}, updated_at = now()
         WHERE id = $${values.length}`,
        values
      );
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'variants')) {
      await syncVariants(client, id, updates.variants);
    }

    const result = await client.query(
      `SELECT ${productFields}
       FROM products p
       LEFT JOIN taxes t ON t.id = p.tax_id
       WHERE p.id = $1`,
      [id]
    );
    return productFromRow(result.rows[0]);
  });
}

async function deleteProduct(id) {
  return withTransaction(async (client) => {
    const product = await client.query(
      'SELECT id FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (product.rows.length === 0) {
      throw notFound('Product not found');
    }

    const usage = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM subscription_lines WHERE product_id = $1)
           OR EXISTS (SELECT 1 FROM invoice_lines WHERE product_id = $1)
           OR EXISTS (SELECT 1 FROM quotation_template_lines WHERE product_id = $1) AS is_used`,
      [id]
    );
    if (usage.rows[0].is_used) {
      throw conflict('This product is used by quotations, subscriptions, or invoices. Deactivate it by setting isActive to false instead.');
    }

    const deleted = await client.query(
      `DELETE FROM products p
       WHERE p.id = $1
       RETURNING p.id, p.name`,
      [id]
    );
    return deleted.rows[0];
  });
}

async function createVariant(productId, variant) {
  return withTransaction(async (client) => {
    const product = await client.query(
      'SELECT id FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );
    if (product.rows.length === 0) {
      throw notFound('Product not found');
    }

    const result = await client.query(
      `INSERT INTO product_variants (product_id, attribute, value, extra_price)
       VALUES ($1, $2, $3, $4)
       RETURNING id, product_id, attribute, value, extra_price`,
      [productId, variant.attribute, variant.value, variant.extraPrice]
    );
    return variantFromRow(result.rows[0]);
  });
}

async function updateVariant(variantId, updates) {
  const columns = {
    attribute: 'attribute',
    value: 'value',
    extraPrice: 'extra_price',
  };
  const values = [];
  const assignments = Object.entries(updates).map(([field, value]) => {
    values.push(value);
    return `${columns[field]} = $${values.length}`;
  });
  values.push(variantId);

  const result = await query(
    `UPDATE product_variants
     SET ${assignments.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, product_id, attribute, value, extra_price`,
    values
  );
  if (result.rows.length === 0) {
    throw notFound('Variant not found');
  }
  return variantFromRow(result.rows[0]);
}

async function deleteVariant(variantId) {
  return withTransaction(async (client) => {
    const variant = await client.query(
      'SELECT id FROM product_variants WHERE id = $1 FOR UPDATE',
      [variantId]
    );
    if (variant.rows.length === 0) {
      throw notFound('Variant not found');
    }

    const usage = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM subscription_lines WHERE variant_id = $1)
           OR EXISTS (SELECT 1 FROM quotation_template_lines WHERE variant_id = $1) AS is_used`,
      [variantId]
    );
    if (usage.rows[0].is_used) {
      throw conflict('This variant is used by a quotation or subscription and cannot be removed.');
    }

    const deleted = await client.query(
      `DELETE FROM product_variants
       WHERE id = $1
       RETURNING id, product_id, attribute, value, extra_price`,
      [variantId]
    );
    return variantFromRow(deleted.rows[0]);
  });
}

function variantFromRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    attribute: row.attribute,
    value: row.value,
    extraPrice: row.extra_price,
  };
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createVariant,
  updateVariant,
  deleteVariant,
  productFromRow,
};
