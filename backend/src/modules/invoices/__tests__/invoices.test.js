const assert = require('assert');
const { generateInvoicePdfBuffer } = require('../pdf.service');

async function testPdfGeneration() {
  console.log('Testing PDF generation...');

  // Test 1: Full invoice with all fields
  const fullInv = {
    number: 'INV-001001',
    customer: {
      name: 'Alice Johnson',
      company: 'Tech Solutions Ltd',
      email: 'alice@example.com',
      phone: '+91 9876543210',
      address: 'Plot 42, Electronics City, Bangalore',
    },
    status: 'CONFIRMED',
    issue_date: '2026-10-31',
    due_date: '2026-11-15',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    subscription_number: 'SUB-001001',
    subtotal: '10000.00',
    discount_total: '1000.00',
    tax_total: '1620.00',
    total: '10620.00',
    amount_paid: '5000.00',
    lines: [
      {
        description: 'Business Suite (Odoo variant)',
        quantity: 2,
        unit_price: '5000.00',
        tax_rate: '18.00',
        amount: '9000.00',
      },
      {
        description: 'Analytics Add-on',
        quantity: 1,
        unit_price: '1000.00',
        tax_rate: '18.00',
        amount: '1000.00',
      },
    ],
    discounts: [{ name: 'Diwali 10% Off', amount: '1000.00' }],
    payments: [
      {
        paid_on: '2026-10-31T10:00:00Z',
        method: 'QR',
        status: 'COMPLETED',
        note: 'Confirmed via QR (simulated)',
        amount: '5000.00',
      },
    ],
  };

  const buf = await generateInvoicePdfBuffer(fullInv);
  assert(Buffer.isBuffer(buf), 'Result must be a Buffer');
  assert(buf.length > 1000, 'Buffer must have content');
  assert(buf.slice(0, 5).toString() === '%PDF-', 'Buffer must be valid PDF header');
  console.log('  Full invoice PDF generated:', buf.length, 'bytes');

  // Test 2: Minimal invoice with empty/missing optional fields
  const minInv = {
    number: 'INV-001002',
    status: 'DRAFT',
    issue_date: '2026-10-31',
    due_date: '2026-11-15',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    subtotal: '0.00',
    discount_total: '0.00',
    tax_total: '0.00',
    total: '0.00',
    amount_paid: '0.00',
    lines: [],
    discounts: [],
    payments: [],
  };

  const minBuf = await generateInvoicePdfBuffer(minInv);
  assert(Buffer.isBuffer(minBuf), 'Result must be a Buffer');
  assert(minBuf.slice(0, 5).toString() === '%PDF-', 'Minimal PDF must be valid PDF header');
  console.log('  Minimal invoice PDF generated:', minBuf.length, 'bytes');
}

async function runAll() {
  try {
    await testPdfGeneration();
    console.log('All Task D1 unit tests passed successfully!');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

runAll();
