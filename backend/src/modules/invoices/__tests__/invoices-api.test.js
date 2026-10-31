const assert = require('assert');
const { query, pool } = require('../../../db/pool');
const invoicesService = require('../invoices.service');
const { generateInvoicePdfBuffer } = require('../pdf.service');

async function runIntegrationTests() {
  console.log('=== Running Task D1: Invoices API Integration Tests ===\n');

  let custAId, custBId, subAId, subBId;
  const createdInvoiceIds = [];
  const createdSubIds = [];
  const createdCustIds = [];
  let planId;

  try {
    // 0. Setup: Ensure an active plan exists or get one
    const planRes = await query(`SELECT id FROM plans LIMIT 1`);
    if (planRes.rows.length > 0) {
      planId = planRes.rows[0].id;
    } else {
      const newPlan = await query(`
        INSERT INTO plans (name, price, billing_period)
        VALUES ('Test Plan D1', 1000.00, 'MONTHLY')
        RETURNING id
      `);
      planId = newPlan.rows[0].id;
    }

    // Create 2 test customers
    const custARes = await query(`
      INSERT INTO customers (name, email, company, address)
      VALUES ('Test Cust A', 'cust_a_${Date.now()}@brightloop.test', 'Company A', '123 Test St')
      RETURNING id, name, email
    `);
    custAId = custARes.rows[0].id;
    createdCustIds.push(custAId);

    const custBRes = await query(`
      INSERT INTO customers (name, email, company, address)
      VALUES ('Test Cust B', 'cust_b_${Date.now()}@brightloop.test', 'Company B', '456 Sample Ave')
      RETURNING id, name, email
    `);
    custBId = custBRes.rows[0].id;
    createdCustIds.push(custBId);

    // Create subscriptions
    const subARes = await query(`
      INSERT INTO subscriptions (customer_id, plan_id, status, start_date, payment_terms)
      VALUES ($1, $2, 'ACTIVE', CURRENT_DATE - 30, 'NET_15')
      RETURNING id
    `, [custAId, planId]);
    subAId = subARes.rows[0].id;
    createdSubIds.push(subAId);

    const subBRes = await query(`
      INSERT INTO subscriptions (customer_id, plan_id, status, start_date, payment_terms)
      VALUES ($1, $2, 'ACTIVE', CURRENT_DATE - 30, 'NET_15')
      RETURNING id
    `, [custBId, planId]);
    subBId = subBRes.rows[0].id;
    createdSubIds.push(subBId);

    // Create 3 test invoices
    // Inv 1: Cust A, DRAFT, overdue dates
    const inv1Res = await query(`
      INSERT INTO invoices (
        subscription_id, customer_id, period_start, period_end,
        issue_date, due_date, subtotal, discount_total, tax_total, total, amount_paid, status
      ) VALUES (
        $1, $2, CURRENT_DATE - 30, CURRENT_DATE - 1,
        CURRENT_DATE - 20, CURRENT_DATE - 5, 2000.00, 200.00, 324.00, 2124.00, 0, 'DRAFT'
      ) RETURNING id, number, status
    `, [subAId, custAId]);
    const inv1 = inv1Res.rows[0];
    createdInvoiceIds.push(inv1.id);

    // Inv 2: Cust A, CONFIRMED, future due date
    const inv2Res = await query(`
      INSERT INTO invoices (
        subscription_id, customer_id, period_start, period_end,
        issue_date, due_date, subtotal, discount_total, tax_total, total, amount_paid, status
      ) VALUES (
        $1, $2, CURRENT_DATE, CURRENT_DATE + 30,
        CURRENT_DATE, CURRENT_DATE + 15, 3000.00, 0, 540.00, 3540.00, 0, 'CONFIRMED'
      ) RETURNING id, number, status
    `, [subAId, custAId]);
    const inv2 = inv2Res.rows[0];
    createdInvoiceIds.push(inv2.id);

    // Inv 3: Cust B, CONFIRMED
    const inv3Res = await query(`
      INSERT INTO invoices (
        subscription_id, customer_id, period_start, period_end,
        issue_date, due_date, subtotal, discount_total, tax_total, total, amount_paid, status
      ) VALUES (
        $1, $2, CURRENT_DATE, CURRENT_DATE + 30,
        CURRENT_DATE, CURRENT_DATE + 15, 5000.00, 500.00, 810.00, 5310.00, 0, 'CONFIRMED'
      ) RETURNING id, number, status
    `, [subBId, custBId]);
    const inv3 = inv3Res.rows[0];
    createdInvoiceIds.push(inv3.id);

    // Add lines to Inv 2
    await query(`
      INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, tax_rate, amount)
      VALUES ($1, 'Monthly Service Line', 1, 3000.00, 18.00, 3000.00)
    `, [inv2.id]);

    console.log('✓ Test fixtures created successfully');

    // TEST 1: Customer Scoping on listInvoices
    console.log('\n--- Test 1: Customer listInvoices scoping ---');
    const custAUser = { role: 'CUSTOMER', customerId: custAId, id: 'cust-a-profile' };
    const listA = await invoicesService.listInvoices({ user: custAUser });

    const custAInvIds = listA.data.map(i => i.id);
    assert(custAInvIds.includes(inv2.id), 'Cust A should see their own CONFIRMED invoice (inv2)');
    assert(!custAInvIds.includes(inv1.id), 'Cust A must NOT see their own DRAFT invoice (inv1)');
    assert(!custAInvIds.includes(inv3.id), 'Cust A must NOT see Cust B invoice (inv3)');
    console.log('✓ Customer sees only own CONFIRMED/PAID invoices');

    // Customer requesting ?status=DRAFT should get 0 results
    const listDraftReq = await invoicesService.listInvoices({ user: custAUser, filters: { status: 'DRAFT' } });
    assert.strictEqual(listDraftReq.data.length, 0, 'Customer requesting DRAFT status should get 0 invoices');
    console.log('✓ Customer filtering by DRAFT correctly returns 0 results');

    // TEST 2: Admin listInvoices with filters and computed overdue fields
    console.log('\n--- Test 2: Admin listInvoices & SQL computed fields ---');
    const adminUser = { role: 'ADMIN', id: 'admin-profile' };
    const adminList = await invoicesService.listInvoices({
      user: adminUser,
      filters: { customerId: custAId },
    });
    const adminSeenIds = adminList.data.map(i => i.id);
    assert(adminSeenIds.includes(inv1.id), 'Admin should see DRAFT invoice');
    assert(adminSeenIds.includes(inv2.id), 'Admin should see CONFIRMED invoice');
    assert(!adminSeenIds.includes(inv3.id), 'Admin filter by customerId should exclude Cust B');

    // Check computed fields
    const inv2Found = adminList.data.find(i => i.id === inv2.id);
    assert(inv2Found.hasOwnProperty('isOverdue') && inv2Found.hasOwnProperty('is_overdue'), 'Row has isOverdue/is_overdue');
    assert(inv2Found.hasOwnProperty('daysOverdue') && inv2Found.hasOwnProperty('days_overdue'), 'Row has daysOverdue/days_overdue');
    assert(inv2Found.hasOwnProperty('outstandingBalance') && inv2Found.hasOwnProperty('outstanding_balance'), 'Row has outstandingBalance');
    assert.strictEqual(inv2Found.isOverdue, false, 'Inv2 due date is in the future, should not be overdue');
    assert.strictEqual(Number(inv2Found.outstandingBalance), 3540.00, 'Outstanding balance should match total - amount_paid');
    console.log('✓ Admin list filters and SQL computed fields (isOverdue, daysOverdue, outstandingBalance) validated');

    // Search filter test
    const searchRes = await invoicesService.listInvoices({
      user: adminUser,
      filters: { search: inv2.number },
    });
    assert(searchRes.data.some(i => i.id === inv2.id), 'Search filter found invoice by number');
    console.log('✓ Search filter by invoice number works');

    // TEST 3: getInvoiceById Scoping & Details
    console.log('\n--- Test 3: getInvoiceById security & details ---');
    // Customer reading own CONFIRMED invoice
    const inv2Detail = await invoicesService.getInvoiceById({ id: inv2.id, user: custAUser });
    assert.strictEqual(inv2Detail.id, inv2.id);
    assert.strictEqual(inv2Detail.customer.id, custAId);
    assert.strictEqual(inv2Detail.lines.length, 1);
    assert.strictEqual(inv2Detail.lines[0].description, 'Monthly Service Line');
    assert(inv2Detail.hasOwnProperty('outstandingBalance'));
    assert(inv2Detail.hasOwnProperty('discount'));
    console.log('✓ Customer can view their own CONFIRMED invoice with lines and customer details');

    // Customer reading another customer's invoice -> 404
    let errCrossCust = null;
    try {
      await invoicesService.getInvoiceById({ id: inv3.id, user: custAUser });
    } catch (e) {
      errCrossCust = e;
    }
    assert(errCrossCust && errCrossCust.statusCode === 404, 'Customer viewing cross-customer invoice must throw 404');
    console.log('✓ Cross-customer access throws 404 Not Found');

    // Customer reading own DRAFT invoice -> 404
    let errDraftCust = null;
    try {
      await invoicesService.getInvoiceById({ id: inv1.id, user: custAUser });
    } catch (e) {
      errDraftCust = e;
    }
    assert(errDraftCust && errDraftCust.statusCode === 404, 'Customer viewing draft invoice must throw 404');
    console.log('✓ Customer viewing own DRAFT invoice throws 404 Not Found');

    // TEST 4: confirmInvoice (DRAFT -> CONFIRMED)
    console.log('\n--- Test 4: confirmInvoice transition & 409 validation ---');
    const confirmedInv1 = await invoicesService.confirmInvoice({ id: inv1.id });
    assert.strictEqual(confirmedInv1.status, 'CONFIRMED');
    assert(confirmedInv1.confirmed_at || confirmedInv1.confirmedAt, 'confirmed_at must be populated');
    console.log('✓ DRAFT invoice transitioned to CONFIRMED with confirmed_at set');

    // Trying to confirm again -> 409
    let errAlreadyConfirmed = null;
    try {
      await invoicesService.confirmInvoice({ id: inv1.id });
    } catch (e) {
      errAlreadyConfirmed = e;
    }
    assert(errAlreadyConfirmed && errAlreadyConfirmed.statusCode === 409, 'Confirming already confirmed invoice must throw 409 Conflict');
    console.log('✓ Confirming non-draft invoice throws 409 Conflict');

    // TEST 5: confirmBulkInvoices
    console.log('\n--- Test 5: confirmBulkInvoices in one SQL update ---');
    // Create 2 new DRAFT invoices
    const bulk1Res = await query(`
      INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, due_date, status)
      VALUES ($1, $2, CURRENT_DATE + 60, CURRENT_DATE + 90, CURRENT_DATE + 75, 'DRAFT')
      RETURNING id, number
    `, [subAId, custAId]);
    const bulk1Id = bulk1Res.rows[0].id;
    createdInvoiceIds.push(bulk1Id);

    const bulk2Res = await query(`
      INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, due_date, status)
      VALUES ($1, $2, CURRENT_DATE + 100, CURRENT_DATE + 130, CURRENT_DATE + 115, 'DRAFT')
      RETURNING id, number
    `, [subAId, custAId]);
    const bulk2Id = bulk2Res.rows[0].id;
    createdInvoiceIds.push(bulk2Id);

    // Bulk confirm with specific ids
    const bulkRes1 = await invoicesService.confirmBulkInvoices({ ids: [bulk1Id] });
    assert(bulkRes1.confirmedIds.includes(bulk1Id), 'bulk1Id should be confirmed');
    assert(!bulkRes1.confirmedIds.includes(bulk2Id), 'bulk2Id should not be confirmed when not in ids array');
    console.log('✓ Bulk confirm with explicit IDs confirmed specified invoice');

    // Bulk confirm without ids (confirms all remaining drafts)
    const bulkRes2 = await invoicesService.confirmBulkInvoices();
    assert(bulkRes2.confirmedIds.includes(bulk2Id), 'Remaining draft bulk2Id confirmed in catch-all bulk update');
    console.log('✓ Bulk confirm without IDs confirmed all remaining drafts');

    // TEST 6: cancelInvoice & payment protection
    console.log('\n--- Test 6: cancelInvoice & payment guard ---');
    // Create a draft invoice for cancellation test
    const cancelInvRes = await query(`
      INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, due_date, status)
      VALUES ($1, $2, CURRENT_DATE + 140, CURRENT_DATE + 170, CURRENT_DATE + 155, 'DRAFT')
      RETURNING id
    `, [subAId, custAId]);
    const cancelInvId = cancelInvRes.rows[0].id;
    createdInvoiceIds.push(cancelInvId);

    // Add a completed payment to it
    const payRes = await query(`
      INSERT INTO payments (invoice_id, method, amount, status, source)
      VALUES ($1, 'QR', 100.00, 'COMPLETED', 'PORTAL_SELF_CONFIRMED')
      RETURNING id
    `, [cancelInvId]);
    const payId = payRes.rows[0].id;

    // Trying to cancel with completed payment -> 409
    let errCancelWithPay = null;
    try {
      await invoicesService.cancelInvoice({ id: cancelInvId });
    } catch (e) {
      errCancelWithPay = e;
    }
    assert(errCancelWithPay && errCancelWithPay.statusCode === 409, 'Cancelling invoice with completed payment must throw 409');
    console.log('✓ Cancelling invoice with completed payment throws 409 Conflict');

    // Delete test payment so we can test successful cancel
    await query(`DELETE FROM payments WHERE id = $1`, [payId]);

    // Now cancel the invoice
    const cancelled = await invoicesService.cancelInvoice({ id: cancelInvId });
    assert.strictEqual(cancelled.status, 'CANCELLED');
    assert(cancelled.cancelled_at || cancelled.cancelledAt, 'cancelled_at must be populated');
    console.log('✓ Invoice cancelled successfully');

    // Trying to cancel again -> 409
    let errAlreadyCancelled = null;
    try {
      await invoicesService.cancelInvoice({ id: cancelInvId });
    } catch (e) {
      errAlreadyCancelled = e;
    }
    assert(errAlreadyCancelled && errAlreadyCancelled.statusCode === 409, 'Cancelling already cancelled invoice must throw 409');
    console.log('✓ Cancelling already cancelled invoice throws 409 Conflict');

    // TEST 7: sendInvoiceEmail auto-confirm & delivery
    console.log('\n--- Test 7: sendInvoiceEmail auto-confirms draft & generates PDF ---');
    const sendDraftRes = await query(`
      INSERT INTO invoices (
        subscription_id, customer_id, period_start, period_end,
        due_date, subtotal, tax_total, total, status
      ) VALUES (
        $1, $2, CURRENT_DATE + 180, CURRENT_DATE + 210,
        CURRENT_DATE + 195, 1000.00, 180.00, 1180.00, 'DRAFT'
      ) RETURNING id, status
    `, [subAId, custAId]);
    const sendDraftId = sendDraftRes.rows[0].id;
    createdInvoiceIds.push(sendDraftId);

    const sendRes = await invoicesService.sendInvoiceEmail({ id: sendDraftId, user: adminUser });
    assert.strictEqual(sendRes.sent, true);
    assert(sendRes.sentAt, 'sentAt must be present');
    assert.strictEqual(sendRes.invoice.status, 'CONFIRMED', 'Draft invoice must be auto-confirmed on send');
    console.log('✓ sendInvoiceEmail auto-confirmed DRAFT invoice and recorded sent_at');

    // Sending a cancelled invoice -> 409
    let errSendCancelled = null;
    try {
      await invoicesService.sendInvoiceEmail({ id: cancelInvId, user: adminUser });
    } catch (e) {
      errSendCancelled = e;
    }
    assert(errSendCancelled && errSendCancelled.statusCode === 409, 'Sending cancelled invoice must throw 409');
    console.log('✓ Sending cancelled invoice throws 409 Conflict');

    // TEST 8: PDF buffer generation
    console.log('\n--- Test 8: PDF Generation check ---');
    const pdfBuf = await generateInvoicePdfBuffer(inv2Detail);
    assert(Buffer.isBuffer(pdfBuf), 'Must return a buffer');
    assert(pdfBuf.slice(0, 5).toString() === '%PDF-', 'Must start with PDF header');
    console.log('✓ PDF generated successfully (%PDF- header verified, size:', pdfBuf.length, 'bytes)');

    console.log('\n======================================================');
    console.log('ALL TASK D1 INTEGRATION TESTS PASSED WITH 100% SUCCESS');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Integration test failed:', err);
    process.exitCode = 1;
  } finally {
    // Teardown
    console.log('Cleaning up test fixtures...');
    try {
      if (createdInvoiceIds.length > 0) {
        await query(`DELETE FROM payments WHERE invoice_id = ANY($1::uuid[])`, [createdInvoiceIds]);
        await query(`DELETE FROM invoice_discounts WHERE invoice_id = ANY($1::uuid[])`, [createdInvoiceIds]);
        await query(`DELETE FROM invoice_lines WHERE invoice_id = ANY($1::uuid[])`, [createdInvoiceIds]);
        await query(`DELETE FROM invoices WHERE id = ANY($1::uuid[])`, [createdInvoiceIds]);
      }
      if (createdSubIds.length > 0) {
        await query(`DELETE FROM subscriptions WHERE id = ANY($1::uuid[])`, [createdSubIds]);
      }
      if (createdCustIds.length > 0) {
        await query(`DELETE FROM customers WHERE id = ANY($1::uuid[])`, [createdCustIds]);
      }
      console.log('✓ Cleanup completed.');
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr.message);
    }
    process.exit(process.exitCode || 0);
  }
}

runIntegrationTests();
