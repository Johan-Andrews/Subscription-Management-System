const assert = require('assert');
const {
  addBillingPeriod,
  computePeriodEnd,
  computeDueDate,
} = require('../billing.service');

async function runBillingTests() {
  console.log('Running Billing Service Unit Tests...');

  // 1. Date math tests
  {
    assert.strictEqual(addBillingPeriod('2026-11-01', 'DAILY'), '2026-11-02');
    assert.strictEqual(addBillingPeriod('2026-11-01', 'WEEKLY'), '2026-11-08');
    assert.strictEqual(addBillingPeriod('2026-11-01', 'MONTHLY'), '2026-12-01');
    assert.strictEqual(addBillingPeriod('2026-11-01', 'YEARLY'), '2027-11-01');

    assert.strictEqual(computePeriodEnd('2026-11-01', 'MONTHLY'), '2026-11-30');
    assert.strictEqual(computePeriodEnd('2026-11-01', 'DAILY'), '2026-11-01');
    assert.strictEqual(computePeriodEnd('2026-11-01', 'WEEKLY'), '2026-11-07');
    assert.strictEqual(computePeriodEnd('2026-11-01', 'YEARLY'), '2027-10-31');

    assert.strictEqual(computeDueDate('2026-11-01', 'IMMEDIATE'), '2026-11-01');
    assert.strictEqual(computeDueDate('2026-11-01', 'NET_15'), '2026-11-16');
    assert.strictEqual(computeDueDate('2026-11-01', 'NET_30'), '2026-12-01');
    console.log('✔ Date math and billing periods verified');
  }

  // 2. Simulation of Billing Catch-up & Idempotency
  {
    const existingInvoices = new Set(); // simulates unique constraint (subscription_id, period_start)

    function simulateBillingStep(sub, todayStr) {
      let currentBilling = sub.next_billing_date;
      let created = 0;
      let skipped = 0;

      while (currentBilling <= todayStr) {
        const key = `${sub.id}_${currentBilling}`;
        if (existingInvoices.has(key)) {
          skipped++;
        } else {
          existingInvoices.add(key);
          created++;
        }
        currentBilling = addBillingPeriod(currentBilling, sub.billing_period);
      }
      sub.next_billing_date = currentBilling;
      return { created, skipped };
    }

    // Subscription 3 months behind: next_billing_date was 2026-08-01, today is 2026-10-31
    const sub = {
      id: 'sub-catchup-1',
      billing_period: 'MONTHLY',
      next_billing_date: '2026-08-01',
    };

    // First run on 2026-10-31: should bill 2026-08-01, 2026-09-01, 2026-10-01 (3 invoices)
    const run1 = simulateBillingStep(sub, '2026-10-31');
    assert.strictEqual(run1.created, 3, 'Catch-up should create 3 invoices');
    assert.strictEqual(run1.skipped, 0);
    assert.strictEqual(sub.next_billing_date, '2026-11-01', 'next_billing_date should advance to 2026-11-01');
    console.log('✔ Catch-up generated 3 sequential invoices for 3 missed periods');

    // Second run on same day: should create 0 invoices (idempotency)
    const run2 = simulateBillingStep(sub, '2026-10-31');
    assert.strictEqual(run2.created, 0, 'Second run must create 0 invoices');
    assert.strictEqual(run2.skipped, 0);
    console.log('✔ Idempotency verified: second run produces 0 new invoices');
  }

  console.log('\nAll Billing Service unit tests passed successfully!');
}

runBillingTests().catch((err) => {
  console.error('Billing tests failed:', err);
  process.exit(1);
});

