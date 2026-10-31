const assert = require('node:assert/strict');
const { seedCatalog } = require('../../../../scripts/seed-catalog');

function createMemoryClient() {
  const tables = {
    taxes: [],
    products: [],
    product_variants: [],
    plans: [],
    discounts: [],
  };
  let nextId = 1;

  return {
    tables,
    async query(sql, params) {
      const selected = sql.match(/^SELECT id FROM (\w+) WHERE name = \$1/);
      if (selected) {
        const rows = tables[selected[1]]
          .filter((record) => record.name === params[0])
          .slice(0, 2)
          .map(({ id }) => ({ id }));
        return { rows };
      }

      const inserted = sql.match(/^INSERT INTO (\w+) \(([^)]+)\)/);
      if (inserted) {
        const table = inserted[1];
        const columns = inserted[2].split(',').map((column) => column.trim());
        const record = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
        if (table === 'product_variants') {
          const existing = tables.product_variants.find((row) => (
            row.product_id === record.product_id
            && row.attribute === record.attribute
            && row.value === record.value
          ));
          if (existing) {
            existing.extra_price = record.extra_price;
            return { rows: [] };
          }
        }
        record.id = `id-${nextId++}`;
        if (table === 'discounts') record.times_used = 0;
        tables[table].push(record);
        return { rows: [{ id: record.id }] };
      }

      const updated = sql.match(/^UPDATE (\w+)$/m);
      if (updated) {
        const table = updated[1];
        const assignmentText = sql.match(/SET ([\s\S]*?), updated_at = now\(\)/)?.[1];
        const assignments = assignmentText.split(',').map((assignment) => assignment.trim());
        const targetId = params[params.length - 1];
        const record = tables[table].find((item) => item.id === targetId);
        assert.ok(record, `Expected ${table} record ${targetId} to exist`);
        for (const assignment of assignments) {
          const [, field, position] = assignment.match(/^(\w+) = \$(\d+)$/);
          record[field] = params[Number(position) - 1];
        }
        return { rows: [{ id: targetId }] };
      }

      throw new Error(`Unexpected seed SQL: ${sql}`);
    },
  };
}

async function run() {
  const client = createMemoryClient();
  const initialSummary = await seedCatalog(client);
  assert.deepEqual(initialSummary, {
    taxes: 2,
    products: 3,
    variants: 2,
    plans: 4,
    discounts: 2,
  });

  const businessSuite = client.tables.products.find((product) => product.name === 'Business Suite');
  const variants = client.tables.product_variants.filter((variant) => (
    variant.product_id === businessSuite.id
  ));
  assert.deepEqual(variants.map(({ value, extra_price }) => [value, extra_price]), [
    ['Odoo', '560.00'],
    ['Zoho', '300.00'],
  ]);
  assert.deepEqual(
    client.tables.plans.map((plan) => plan.billing_period).sort(),
    ['DAILY', 'MONTHLY', 'WEEKLY', 'YEARLY']
  );

  const usedDiscount = client.tables.discounts.find((item) => item.type === 'PERCENT');
  usedDiscount.times_used = 4;
  const rerunSummary = await seedCatalog(client);
  assert.deepEqual(rerunSummary, initialSummary);
  assert.deepEqual({
    taxes: client.tables.taxes.length,
    products: client.tables.products.length,
    variants: client.tables.product_variants.length,
    plans: client.tables.plans.length,
    discounts: client.tables.discounts.length,
  }, initialSummary);
  assert.equal(usedDiscount.times_used, 4, 'Rerunning the seed must preserve discount usage');

  console.log('Catalog seed tests passed, including idempotent rerun.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
