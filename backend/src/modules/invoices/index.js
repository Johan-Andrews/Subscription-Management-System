const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const asyncHandler = require('../../lib/asyncHandler');
const invoicesService = require('./invoices.service');
const { streamInvoicePdf } = require('./pdf.service');

/**
 * GET /api/invoices
 * List invoices with filters and pagination
 * Admin & Staff see all matching; Customer sees only own CONFIRMED/PAID
 */
router.get(
  '/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await invoicesService.listInvoices({
      user: req.user,
      filters: req.query,
      paging: req.query,
    });
    res.json(result);
  })
);

/**
 * POST /api/invoices/confirm-bulk
 * Confirm multiple draft invoices in one operation
 * Admin & Staff only
 */
router.post(
  '/invoices/confirm-bulk',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  asyncHandler(async (req, res) => {
    const { ids } = req.body || {};
    const result = await invoicesService.confirmBulkInvoices({ ids });
    res.json({ data: result });
  })
);

/**
 * GET /api/invoices/:id/pdf
 * Stream generated PDF for printing or download
 * Accessible by Admin, Staff, or owning Customer
 */
router.get(
  '/invoices/:id/pdf',
  requireAuth,
  asyncHandler(async (req, res) => {
    const invoice = await invoicesService.getInvoiceById({
      id: req.params.id,
      user: req.user,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${invoice.number || 'invoice'}.pdf"`
    );

    streamInvoicePdf(invoice, res);
  })
);

/**
 * POST /api/invoices/:id/confirm
 * Move DRAFT invoice to CONFIRMED
 * Admin & Staff only
 */
router.post(
  '/invoices/:id/confirm',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  asyncHandler(async (req, res) => {
    const invoice = await invoicesService.confirmInvoice({
      id: req.params.id,
    });
    res.json({ data: invoice });
  })
);

/**
 * POST /api/invoices/:id/cancel
 * Cancel DRAFT or CONFIRMED invoice (if no completed payments)
 * Admin & Staff only
 */
router.post(
  '/invoices/:id/cancel',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  asyncHandler(async (req, res) => {
    const invoice = await invoicesService.cancelInvoice({
      id: req.params.id,
    });
    res.json({ data: invoice });
  })
);

/**
 * POST /api/invoices/:id/send
 * Email invoice PDF to customer (auto-confirms if draft)
 * Admin & Staff only
 */
router.post(
  '/invoices/:id/send',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  asyncHandler(async (req, res) => {
    const result = await invoicesService.sendInvoiceEmail({
      id: req.params.id,
      user: req.user,
    });
    res.json({ data: result });
  })
);

/**
 * GET /api/invoices/:id
 * Get single invoice with customer, lines, discounts, and payments
 * Admin, Staff, or owning Customer
 */
router.get(
  '/invoices/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const invoice = await invoicesService.getInvoiceById({
      id: req.params.id,
      user: req.user,
    });
    res.json({ data: invoice });
  })
);

module.exports = router;
