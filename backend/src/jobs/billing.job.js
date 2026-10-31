const { runBilling } = require('../modules/billing/billing.service');

/**
 * Billing Job (Member C)
 * Runs scheduled billing for due active subscriptions.
 */
const runDaily = async () => {
  console.log('[CRON] Billing daily job triggered');
  try {
    const result = await runBilling({ trigger: 'CRON' });
    console.log('[CRON] Billing daily job finished:', result);
    return result;
  } catch (err) {
    console.error('[CRON] Billing daily job failed:', err);
    throw err;
  }
};

module.exports = {
  runDaily,
};
