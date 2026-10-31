const { withTransaction, pool } = require('../src/db/pool');

async function upsertNamedRecord(client, table, name, fields) {
  const existing = await client.query(
    `SELECT id FROM ${table} WHERE name = $1 ORDER BY created_at, id LIMIT 2`,
    [name]
  );
  if (existing.rows.length > 1) {
    throw new Error(`Cannot seed ${table}: multiple records named "${name}" already exist`);
  }

  const fieldNames = Object.keys(fields);
  const values = [name, ...Object.values(fields)];
  if (existing.rows.length === 1) {
    const assignments = fieldNames.map((field, index) => `${field} = $${index + 2}`);
    const idPosition = values.length + 1;
    const result = await client.query(
      `UPDATE ${table}
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE id = $${idPosition}
       RETURNING id`,
      [...values, existing.rows[0].id]
    );
    return result.rows[0].id;
  }

  const columns = ['name', ...fieldNames];
  const placeholders = values.map((value, index) => `$${index + 1}`);
  const result = await client.query(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING id`,
    values
  );
  return result.rows[0].id;
}

async function upsertVariant(client, productId, variant) {
  await client.query(
    `INSERT INTO product_variants (product_id, attribute, value, extra_price)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, attribute, value)
     DO UPDATE SET extra_price = EXCLUDED.extra_price`,
    [productId, variant.attribute, variant.value, variant.extraPrice]
  );
}

async function seedCatalog(client) {
  const tax18Id = await upsertNamedRecord(client, 'taxes', 'GST 18%', {
    type: 'PERCENT',
    rate: '18.00',
    is_active: true,
  });
  const tax5Id = await upsertNamedRecord(client, 'taxes', 'GST 5%', {
    type: 'PERCENT',
    rate: '5.00',
    is_active: true,
  });

  const businessSuiteId = await upsertNamedRecord(client, 'products', 'Business Suite', {
    type: 'SOFTWARE',
    sales_price: '2500.00',
    cost_price: '1200.00',
    notes: 'Core business management subscription.',
    tax_id: tax18Id,
    is_active: true,
  });
  await upsertVariant(client, businessSuiteId, {
    attribute: 'Brand',
    value: 'Odoo',
    extraPrice: '560.00',
  });
  await upsertVariant(client, businessSuiteId, {
    attribute: 'Brand',
    value: 'Zoho',
    extraPrice: '300.00',
  });

  await upsertNamedRecord(client, 'products', 'CRM Add-on', {
    type: 'ADDON',
    sales_price: '800.00',
    cost_price: '350.00',
    notes: 'Customer relationship management add-on.',
    tax_id: tax18Id,
    is_active: true,
  });
  await upsertNamedRecord(client, 'products', 'Analytics Add-on', {
    type: 'ADDON',
    sales_price: '1200.00',
    cost_price: '600.00',
    notes: 'Business analytics and reporting add-on.',
    tax_id: tax5Id,
    is_active: true,
  });

  const plans = [
    {
      name: 'Monthly',
      price: '2500.00',
      billing_period: 'MONTHLY',
      min_qty: 1,
      available_from: null,
      available_to: null,
      auto_close: true,
      closable: true,
      pausable: true,
      renewable: true,
      is_active: true,
    },
    {
      name: 'Yearly',
      price: '25000.00',
      billing_period: 'YEARLY',
      min_qty: 5,
      available_from: null,
      available_to: null,
      auto_close: true,
      closable: false,
      pausable: true,
      renewable: true,
      is_active: true,
    },
    {
      name: 'Weekly',
      price: '700.00',
      billing_period: 'WEEKLY',
      min_qty: 2,
      available_from: null,
      available_to: null,
      auto_close: false,
      closable: true,
      pausable: false,
      renewable: false,
      is_active: true,
    },
    {
      name: 'Daily',
      price: '120.00',
      billing_period: 'DAILY',
      min_qty: 1,
      available_from: null,
      available_to: null,
      auto_close: false,
      closable: false,
      pausable: false,
      renewable: true,
      is_active: true,
    },
  ];
  for (const { name, ...fields } of plans) {
    await upsertNamedRecord(client, 'plans', name, fields);
  }

  const discounts = [
    {
      name: '10% off for 10+ seats',
      type: 'PERCENT',
      value: '10.00',
      min_purchase: '0.00',
      min_qty: 10,
      start_date: null,
      end_date: null,
      usage_limit: null,
      scope: 'SUBSCRIPTION',
      is_active: true,
    },
    {
      name: 'INR 500 off orders over INR 5,000',
      type: 'FIXED',
      value: '500.00',
      min_purchase: '5000.00',
      min_qty: 0,
      start_date: null,
      end_date: null,
      usage_limit: null,
      scope: 'SUBSCRIPTION',
      is_active: true,
    },
  ];
  for (const { name, ...fields } of discounts) {
    await upsertNamedRecord(client, 'discounts', name, fields);
  }

  return {
    taxes: 2,
    products: 3,
    variants: 2,
    plans: plans.length,
    discounts: discounts.length,
  };
}

async function main() {
  try {
    const summary = await withTransaction(seedCatalog);
    console.log('Catalog seed completed successfully:', summary);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to seed catalog:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  seedCatalog,
};
