const express = require('express');
const { query } = require('../../db/pool');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const asyncHandler = require('../../lib/asyncHandler');
const { parsePaging, pageResult } = require('../../lib/pagination');
const { runBilling } = require('./billing.service');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('ADMIN', 'STAFF'));

/**
 * POST /api/billing/run
 * Manually trigger a billing engine execution
 */
router.post(
  '/billing/run',
  asyncHandler(async (req, res) => {
    const result = await runBilling({
      trigger: 'MANUAL',
      userId: req.user.id,
    });
    res.json({ data: result });
  })
);

/**
 * GET /api/billing/runs
 * List historical billing engine execution runs
 */
router.get(
  '/billing/runs',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);

    const countRes = await query('SELECT COUNT(*) AS total FROM billing_runs');
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const runsSql = `
      SELECT
        br.id,
        br.triggered_by,
        br.triggered_user,
        p.full_name AS triggered_user_name,
        p.email AS triggered_user_email,
        br.started_at,
        br.finished_at,
        br.due_count,
        br.invoices_created,
        br.skipped_existing,
        br.failed,
        br.details,
        ROUND(EXTRACT(EPOCH FROM (br.finished_at - br.started_at))::numeric, 2) AS duration_seconds
      FROM billing_runs br
      LEFT JOIN profiles p ON p.id = br.triggered_user
      ORDER BY br.started_at DESC
      LIMIT $1 OFFSET $2
    `;
    const runsRes = await query(runsSql, [limit, offset]);

    res.json(pageResult(runsRes.rows, page, pageSize, total));
  })
);

module.exports = router;
