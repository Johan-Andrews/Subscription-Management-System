const cron = require('node-cron');
const env = require('../config/env');
const billingJob = require('./billing.job');

const startScheduler = () => {
  if (!env.CRON_ENABLED) {
    console.log('[SCHEDULER] Background cron jobs disabled (CRON_ENABLED=false)');
    return null;
  }

  console.log(`[SCHEDULER] Registering billing job with schedule: ${env.BILLING_CRON}`);
  const task = cron.schedule(env.BILLING_CRON, async () => {
    try {
      console.log('[SCHEDULER] Executing scheduled billing run...');
      await billingJob.runDaily();
    } catch (err) {
      console.error('[SCHEDULER] Error during scheduled billing run:', err);
    }
  });

  return task;
};

module.exports = {
  startScheduler,
};

