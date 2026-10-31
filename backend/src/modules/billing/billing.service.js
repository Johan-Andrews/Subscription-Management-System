const { query, withTransaction } = require('../../db/pool');
const { toPaise, fromPaise, mulPaise, percentOf } = require('../../lib/money');
const pricingService = require('../catalog/pricing.service');
const autocloseJob = require('../../jobs/autoclose.job');
const env = require('../../config/env');

/**
 * Adds one billing period to a YYYY-MM-DD date string
 */
function addBillingPeriod(dateStr, period) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  switch (period) {
    case 'DAILY':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case 'YEARLY':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

/**
 * Computes period_end = (period_start + 1 period) - 1 day
 */
function computePeriodEnd(periodStartStr, period) {
  const nextPeriodStart = addBillingPeriod(periodStartStr, period);
  const [year, month, day] = nextPeriodStart.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Computes due_date = issue_date + payment_terms
 */
function computeDueDate(issueDateStr, paymentTerms) {
  const [year, month, day] = issueDateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  let daysToAdd = 15;
  switch (paymentTerms) {
    case 'IMMEDIATE':
      daysToAdd = 0;
      break;
    case 'NET_15':
      daysToAdd = 15;
      break;
    case 'NET_30':
      daysToAdd = 30;
      break;
    case 'NET_60':
      daysToAdd = 60;
      break;
  }
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d.toISOString().split('T')[0];
}

/**
 * Executes a full billing engine run
 * @param {{ trigger: 'CRON' | 'MANUAL', userId?: string }} options
 */
async function runBilling({ trigger = 'MANUAL', userId = null }) {
  console.log(`[BILLING] Starting billing run (Trigger: ${trigger}, User: ${userId || 'System'})`);

  // 1. Insert billing_runs row
  const startRes = await query(
    `INSERT INTO billing_runs (triggered_by, triggered_user, started_at)
     VALUES ($1, $2, NOW())
     RETURNING id`,
    [trigger, userId]
  );
  const runId = startRes.rows[0].id;

  let dueCount = 0;
  let invoicesCreated = 0;
  let skippedExisting = 0;
  let failed = 0;
  const failureDetails = [];

  try {
    // 2. Activate due: CONFIRMED subscriptions where start_date <= current_date
    const dueConfirmed = await query(
      `SELECT id, start_date
       FROM subscriptions
       WHERE status = 'CONFIRMED'
         AND start_date <= CURRENT_DATE`
    );

    for (const sub of dueConfirmed.rows) {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE subscriptions
           SET status = 'ACTIVE',
               next_billing_date = COALESCE(next_billing_date, start_date),
               updated_at = NOW()
           WHERE id = $1`,
          [sub.id]
        );
        await client.query(
          `INSERT INTO subscription_status_history (
            subscription_id, from_status, to_status, action, changed_by
          ) VALUES ($1, 'CONFIRMED', 'ACTIVE', 'activate_due', $2)`,
          [sub.id, userId]
        );
      });
    }

    // 3. Find due subscriptions
    const dueSubsRes = await query(
      `SELECT id
       FROM subscriptions
       WHERE status = 'ACTIVE'
         AND is_paused = false
         AND next_billing_date IS NOT NULL
         AND next_billing_date <= CURRENT_DATE
         AND (expiry_date IS NULL OR next_billing_date <= expiry_date)
       ORDER BY next_billing_date ASC`
    );

    dueCount = dueSubsRes.rows.length;
    const dueIds = dueSubsRes.rows.map((r) => r.id);

    // Process in batches of 200
    const BATCH_SIZE = 200;
    for (let i = 0; i < dueIds.length; i += BATCH_SIZE) {
      const batch = dueIds.slice(i, i + BATCH_SIZE);

      for (const subId of batch) {
        // 4. Each subscription in its own transaction
        try {
          await withTransaction(async (client) => {
            // Lock and re-verify due
            const subRes = await client.query(
              `SELECT s.*, p.billing_period
               FROM subscriptions s
               JOIN plans p ON p.id = s.plan_id
               WHERE s.id = $1
               FOR UPDATE OF s`,
              [subId]
            );

            if (subRes.rows.length === 0) return;
            const sub = subRes.rows[0];

            if (sub.status !== 'ACTIVE' || sub.is_paused) return;

            const todayStr = new Date().toISOString().split('T')[0];
            let currentBillingDate = sub.next_billing_date;

            // Fetch subscription lines
            const linesRes = await client.query(
              `SELECT * FROM subscription_lines WHERE subscription_id = $1 ORDER BY id ASC`,
              [subId]
            );
            const subLines = linesRes.rows;
            if (subLines.length === 0) return;

            // Catch-up loop: bill all overdue periods up to today / expiry_date
            while (
              currentBillingDate <= todayStr &&
              (!sub.expiry_date || currentBillingDate <= sub.expiry_date)
            ) {
              const periodStart = currentBillingDate;
              const periodEnd = computePeriodEnd(periodStart, sub.billing_period);
              const issueDate = todayStr;
              const dueDate = computeDueDate(issueDate, sub.payment_terms);

              // Compute lines gross and subtotal
              let grossSubtotalPaise = 0;
              let totalQty = 0;
              const linesWithGross = subLines.map((line, idx) => {
                const unitPricePaise = toPaise(line.unit_price);
                const grossPaise = mulPaise(unitPricePaise, line.quantity);
                grossSubtotalPaise += grossPaise;
                totalQty += Number(line.quantity);
                return {
                  index: idx,
                  productId: line.product_id,
                  quantity: line.quantity,
                  unit_price: line.unit_price,
                  unitPricePaise,
                  gross: fromPaise(grossPaise),
                  grossPaise,
                  tax_rate: line.tax_rate,
                  tax_type: line.tax_type,
                  description: line.description,
                };
              });

              // Check discount
              let discount = null;
              try {
                discount = await pricingService.findBestDiscount(client, {
                  lines: linesWithGross,
                  subtotal: fromPaise(grossSubtotalPaise),
                  totalQty,
                  onDate: issueDate,
                });
              } catch (discErr) {
                console.warn('[BILLING] Discount lookup warning:', discErr.message);
              }

              // If discount selected, attempt to increment times_used atomically
              let validDiscount = null;
              if (discount && discount.discountId) {
                const discUpdateRes = await client.query(
                  `UPDATE discounts
                   SET times_used = times_used + 1
                   WHERE id = $1
                     AND (usage_limit IS NULL OR times_used < usage_limit)
                   RETURNING *`,
                  [discount.discountId]
                );

                if (discUpdateRes.rows.length > 0) {
                  validDiscount = discount;
                } else {
                  // Discount just ran out; proceed without discount
                  validDiscount = null;
                }
              }

              // Compute line discounts and taxes
              let totalDiscountPaise = 0;
              let totalTaxPaise = 0;

              const invoiceLinesToInsert = linesWithGross.map((line) => {
                let lineDiscountPaise = 0;
                if (validDiscount?.lineAllocations) {
                  const alloc = validDiscount.lineAllocations.find((a) => a.index === line.index);
                  if (alloc) {
                    lineDiscountPaise = Math.min(line.grossPaise, toPaise(alloc.amount));
                  }
                }
                totalDiscountPaise += lineDiscountPaise;

                const netPaise = line.grossPaise - lineDiscountPaise;

                let taxPaise = 0;
                if (line.tax_type === 'FIXED') {
                  taxPaise = toPaise(line.tax_rate);
                } else {
                  taxPaise = percentOf(netPaise, line.tax_rate);
                }
                totalTaxPaise += taxPaise;

                return {
                  productId: line.productId,
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: line.unit_price,
                  discountAmount: fromPaise(lineDiscountPaise),
                  taxRate: line.tax_rate,
                  taxType: line.tax_type,
                  taxAmount: fromPaise(taxPaise),
                  amount: fromPaise(netPaise), // net = qty*unit_price - discount
                };
              });

              const subtotalStr = fromPaise(grossSubtotalPaise);
              const discountTotalStr = fromPaise(totalDiscountPaise);
              const taxTotalStr = fromPaise(totalTaxPaise);
              const totalPaise = grossSubtotalPaise - totalDiscountPaise + totalTaxPaise;
              const totalStr = fromPaise(totalPaise);

              // Determine invoice status based on AUTO_CONFIRM_INVOICES config
              const autoConfirm =
                env.AUTO_CONFIRM_INVOICES === true ||
                env.AUTO_CONFIRM_INVOICES === 'true' ||
                String(process.env.AUTO_CONFIRM_INVOICES).toLowerCase() === 'true';

              const invoiceStatus = autoConfirm ? 'CONFIRMED' : 'DRAFT';
              const confirmedAt = autoConfirm ? new Date().toISOString() : null;

              // Insert invoice with idempotency conflict check
              const insertInvSql = `
                INSERT INTO invoices (
                  subscription_id,
                  customer_id,
                  period_start,
                  period_end,
                  issue_date,
                  due_date,
                  subtotal,
                  discount_total,
                  tax_total,
                  total,
                  amount_paid,
                  status,
                  confirmed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12)
                ON CONFLICT (subscription_id, period_start) DO NOTHING
                RETURNING id
              `;
              const invRes = await client.query(insertInvSql, [
                sub.id,
                sub.customer_id,
                periodStart,
                periodEnd,
                issueDate,
                dueDate,
                subtotalStr,
                discountTotalStr,
                taxTotalStr,
                totalStr,
                invoiceStatus,
                confirmedAt,
              ]);

              if (invRes.rows.length === 0) {
                // Period was already billed
                skippedExisting++;
              } else {
                const invoiceId = invRes.rows[0].id;

                // Insert invoice lines
                for (const il of invoiceLinesToInsert) {
                  await client.query(
                    `INSERT INTO invoice_lines (
                      invoice_id,
                      product_id,
                      description,
                      quantity,
                      unit_price,
                      discount_amount,
                      tax_rate,
                      tax_type,
                      tax_amount,
                      amount
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                      invoiceId,
                      il.productId,
                      il.description,
                      il.quantity,
                      il.unitPrice,
                      il.discountAmount,
                      il.taxRate,
                      il.taxType,
                      il.taxAmount,
                      il.amount,
                    ]
                  );
                }

                // Insert invoice discount if applied
                if (validDiscount && totalDiscountPaise > 0) {
                  await client.query(
                    `INSERT INTO invoice_discounts (
                      invoice_id,
                      discount_id,
                      name,
                      amount
                    ) VALUES ($1, $2, $3, $4)`,
                    [
                      invoiceId,
                      validDiscount.discountId,
                      validDiscount.name || 'Applied Discount',
                      discountTotalStr,
                    ]
                  );
                }

                invoicesCreated++;
              }

              // Advance to next period
              currentBillingDate = addBillingPeriod(currentBillingDate, sub.billing_period);
            }

            // Update subscription's next_billing_date
            await client.query(
              `UPDATE subscriptions
               SET next_billing_date = $1, updated_at = NOW()
               WHERE id = $2`,
              [currentBillingDate, sub.id]
            );
          });
        } catch (subErr) {
          failed++;
          failureDetails.push({
            subscriptionId: subId,
            error: subErr.message,
          });
          console.error(`[BILLING] Error processing subscription ${subId}:`, subErr.message);
        }
      }
    }

    // 5. Run autoclose job
    try {
      await autocloseJob.run();
    } catch (acErr) {
      console.warn('[BILLING] Autoclose step warning:', acErr.message);
    }
  } catch (runErr) {
    console.error('[BILLING] Critical error during billing run:', runErr);
    failureDetails.push({ generalError: runErr.message });
  } finally {
    // 6. Finish billing_runs row
    await query(
      `UPDATE billing_runs
       SET finished_at = NOW(),
           due_count = $1,
           invoices_created = $2,
           skipped_existing = $3,
           failed = $4,
           details = $5
       WHERE id = $6`,
      [dueCount, invoicesCreated, skippedExisting, failed, JSON.stringify({ failureDetails })]
    );
  }

  const result = {
    runId,
    dueCount,
    invoicesCreated,
    skippedExisting,
    failed,
  };

  console.log('[BILLING] Billing run complete:', result);
  return result;
}

module.exports = {
  runBilling,
  addBillingPeriod,
  computePeriodEnd,
  computeDueDate,
};
