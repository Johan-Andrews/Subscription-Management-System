const assert = require('node:assert/strict');
const {
  findBestDiscount,
  getTaxForProduct,
  getUnitPrice,
} = require('../pricing.service');

const today = '2026-10-31';
const productA = '00000000-0000-4000-8000-000000000001';
const productB = '00000000-0000-4000-8000-000000000002';

function discount(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    name: 'Test discount',
    type: 'FIXED',
    value: '100.00',
    min_purchase: '0.00',
    min_qty: 0,
    start_date: null,
    end_date: null,
    usage_limit: null,
    times_used: 0,
    scope: 'SUBSCRIPTION',
    is_active: true,
    ...overrides,
  };
}

function createClient(discounts = [], productLinks = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM discounts d')) {
        return { rows: discounts };
      }
      if (sql.includes('FROM discount_products')) {
        const selectedIds = new Set(params[0]);
        return { rows: productLinks.filter((row) => selectedIds.has(row.discount_id)) };
      }
      if (sql.includes('FROM products p')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

async function run() {
  const productPriceClient = {
    async query(sql, params) {
      assert.match(sql, /LEFT JOIN product_variants/);
      assert.deepEqual(params, [productA, 'variant-a']);
      return { rows: [{ sales_price: '1000.00', extra_price: '560.00' }] };
    },
  };
  assert.equal(await getUnitPrice(productPriceClient, {
    productId: productA,
    variantId: 'variant-a',
  }), '1560.00');

  const activeTaxClient = {
    async query() {
      return { rows: [{ id: 'tax-1', rate: '18.00', type: 'PERCENT' }] };
    },
  };
  assert.deepEqual(await getTaxForProduct(activeTaxClient, productA), {
    taxId: 'tax-1',
    rate: '18.00',
    type: 'PERCENT',
  });
  assert.deepEqual(await getTaxForProduct(createClient(), productA), {
    taxId: null,
    rate: '0',
    type: 'PERCENT',
  });

  const discountCandidates = [
    discount({
      id: 'fixed',
      name: 'Fixed saving',
      type: 'FIXED',
      value: '250.00',
    }),
    discount({
      id: 'percent',
      name: 'Percent saving',
      type: 'PERCENT',
      value: '10.00',
    }),
  ];
  const discountClient = createClient(discountCandidates);
  const selection = await findBestDiscount(discountClient, {
    lines: [
      { index: 0, productId: productA, quantity: 1, gross: '1000.00' },
      { index: 1, productId: productB, quantity: 1, gross: '1000.00' },
    ],
    subtotal: '2000.00',
    totalQty: 2,
    onDate: today,
  });
  assert.equal(selection.discountId, 'fixed');
  assert.equal(selection.total, '250.00');
  assert.deepEqual(selection.lineAllocations, [
    { index: 0, amount: '125.00' },
    { index: 1, amount: '125.00' },
  ]);
  assert.match(discountClient.calls[0].sql, /FOR UPDATE/);
  assert.deepEqual(discountClient.calls[0].params, [today, 2, '2000.00']);

  const percentageWins = await findBestDiscount(createClient([
    discount({ id: 'small-fixed', value: '150.00' }),
    discount({ id: 'large-percent', type: 'PERCENT', value: '10.00' }),
  ]), {
    lines: [{ productId: productA, quantity: 1, gross: '2000.00' }],
    subtotal: '2000.00',
    totalQty: 1,
    onDate: today,
  });
  assert.equal(percentageWins.discountId, 'large-percent');
  assert.equal(percentageWins.total, '200.00');

  const invalidWindowDiscounts = [
    discount({ id: 'expired', end_date: '2026-10-30' }),
    discount({ id: 'upcoming', start_date: '2026-11-01' }),
    discount({ id: 'exhausted', usage_limit: 2, times_used: 2 }),
  ];
  const invalidWindowResult = await findBestDiscount(createClient(invalidWindowDiscounts), {
    lines: [{ productId: productA, quantity: 1, gross: '1000.00' }],
    subtotal: '1000.00',
    totalQty: 1,
    onDate: today,
  });
  assert.equal(invalidWindowResult, null);

  const minQtyResult = await findBestDiscount(createClient([
    discount({ min_qty: 3 }),
  ]), {
    lines: [{ productId: productA, quantity: 2, gross: '1000.00' }],
    subtotal: '1000.00',
    totalQty: 2,
    onDate: today,
  });
  assert.equal(minQtyResult, null);

  const minPurchaseResult = await findBestDiscount(createClient([
    discount({ min_purchase: '1000.01' }),
  ]), {
    lines: [{ productId: productA, quantity: 1, gross: '1000.00' }],
    subtotal: '1000.00',
    totalQty: 1,
    onDate: today,
  });
  assert.equal(minPurchaseResult, null);

  const productScoped = discount({
    id: 'product-scoped',
    type: 'PERCENT',
    value: '10.00',
    scope: 'PRODUCT',
  });
  const scopedClient = createClient([productScoped], [
    { discount_id: 'product-scoped', product_id: productA },
  ]);
  const productScopeResult = await findBestDiscount(scopedClient, {
    lines: [
      { index: 0, productId: productA, quantity: 1, gross: '1000.00' },
      { index: 1, productId: productB, quantity: 1, gross: '500.00' },
    ],
    subtotal: '1500.00',
    totalQty: 2,
    onDate: today,
  });
  assert.equal(productScopeResult.total, '100.00');
  assert.deepEqual(productScopeResult.lineAllocations, [
    { index: 0, amount: '100.00' },
  ]);

  const subscriptionScoped = discount({
    id: 'subscription-scoped',
    type: 'PERCENT',
    value: '10.00',
  });
  const subscriptionScopeResult = await findBestDiscount(
    createClient([subscriptionScoped]),
    {
      lines: [
        { index: 0, productId: productA, quantity: 1, gross: '1000.00' },
        { index: 1, productId: productB, quantity: 1, gross: '500.00' },
      ],
      subtotal: '1500.00',
      totalQty: 2,
      onDate: today,
    }
  );
  assert.equal(subscriptionScopeResult.total, '150.00');
  assert.deepEqual(subscriptionScopeResult.lineAllocations, [
    { index: 0, amount: '100.00' },
    { index: 1, amount: '50.00' },
  ]);

  const roundingResult = await findBestDiscount(createClient([
    discount({ id: 'rounding', value: '0.02' }),
  ]), {
    lines: [
      { index: 0, productId: productA, quantity: 1, gross: '0.02' },
      { index: 1, productId: productB, quantity: 1, gross: '0.01' },
    ],
    subtotal: '0.03',
    totalQty: 2,
    onDate: today,
  });
  assert.deepEqual(roundingResult.lineAllocations, [
    { index: 0, amount: '0.01' },
    { index: 1, amount: '0.01' },
  ]);

  const cappedRoundingResult = await findBestDiscount(createClient([
    discount({ id: 'capped-rounding', value: '0.02' }),
  ]), {
    lines: [
      { index: 0, productId: productA, quantity: 1, gross: '0.01' },
      { index: 1, productId: productB, quantity: 1, gross: '0.01' },
      { index: 2, productId: productA, quantity: 1, gross: '0.01' },
    ],
    subtotal: '0.03',
    totalQty: 3,
    onDate: today,
  });
  assert.deepEqual(cappedRoundingResult.lineAllocations, [
    { index: 0, amount: '0.00' },
    { index: 1, amount: '0.01' },
    { index: 2, amount: '0.01' },
  ]);

  console.log('Pricing service tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
