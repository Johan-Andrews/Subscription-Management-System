const { query, withTransaction } = require('../db/pool');

/**
 * Autoclose Job (Member C)
 * 1. Closes ACTIVE subscriptions where expiry_date < current_date and plan.auto_close = true
 * 2. Closes QUOTATION subscriptions whose quotation_valid_until < current_date has passed
 */
const run = async () => {
  console.log('[AUTOCLOSE] Running autoclose job...');

  try {
    const closedCount = await withTransaction(async (client) => {
      let count = 0;

      // 1. Find ACTIVE subscriptions past expiry with auto_close = true
      const expiredActiveRes = await client.query(
        `SELECT s.id
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         WHERE s.status = 'ACTIVE'
           AND s.expiry_date IS NOT NULL
           AND s.expiry_date < CURRENT_DATE
           AND p.auto_close = true
         FOR UPDATE OF s`
      );

      for (const row of expiredActiveRes.rows) {
        await client.query(
          `UPDATE subscriptions
           SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        await client.query(
          `INSERT INTO subscription_status_history (
            subscription_id, from_status, to_status, action
          ) VALUES ($1, 'ACTIVE', 'CLOSED', 'auto_close')`,
          [row.id]
        );
        count++;
      }

      // 2. Find QUOTATION subscriptions past quotation_valid_until
      const expiredQuotationRes = await client.query(
        `SELECT id
         FROM subscriptions
         WHERE status = 'QUOTATION'
           AND quotation_valid_until IS NOT NULL
           AND quotation_valid_until < CURRENT_DATE
         FOR UPDATE`
      );

      for (const row of expiredQuotationRes.rows) {
        await client.query(
          `UPDATE subscriptions
           SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        await client.query(
          `INSERT INTO subscription_status_history (
            subscription_id, from_status, to_status, action
          ) VALUES ($1, 'QUOTATION', 'CLOSED', 'auto_close')`,
          [row.id]
        );
        count++;
      }

      return count;
    });

    console.log(`[AUTOCLOSE] Completed. Closed ${closedCount} expired subscriptions.`);
    return closedCount;
  } catch (err) {
    console.error('[AUTOCLOSE] Error running autoclose job:', err);
    throw err;
  }
};

module.exports = {
  run,
};
