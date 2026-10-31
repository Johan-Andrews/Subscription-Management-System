const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../lib/asyncHandler');
const { pageResult, parsePaging } = require('../../lib/pagination');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const discounts = require('./discounts.service');

const router = express.Router();
const discountTypes = ['FIXED', 'PERCENT'];
const discountScopes = ['PRODUCT', 'SUBSCRIPTION'];

const amountSchema = z.preprocess(
  (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value),
  z.string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Amount must be a non-negative number with up to two decimal places')
);

function isValidDate(value) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const dateSchema = z.string()
  .refine(isValidDate, { message: 'Date must be a valid YYYY-MM-DD date' })
  .nullable();
const productIdsSchema = z.array(z.string().uuid())
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Product IDs must be unique',
  });

const discountFields = {
  name: z.string().trim().min(1).max(160),
  type: z.enum(discountTypes),
  value: amountSchema.refine((value) => Number(value) > 0, {
    message: 'Discount value must be greater than zero',
  }),
  minPurchase: amountSchema.default('0'),
  minQty: z.number().int().min(0).max(2147483647).default(0),
  startDate: dateSchema.default(null),
  endDate: dateSchema.default(null),
  usageLimit: z.number().int().min(1).max(2147483647).nullable().default(null),
  scope: z.enum(discountScopes),
  isActive: z.boolean().default(true),
  productIds: productIdsSchema.default([]),
};

const createDiscountSchema = z.object(discountFields)
  .strict()
  .superRefine((discount, context) => {
    if (discount.type === 'PERCENT' && Number(discount.value) > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage discount cannot exceed 100',
      });
    }
    if (discount.endDate && discount.startDate && discount.endDate < discount.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'Discount end date must be on or after the start date',
      });
    }
    if (discount.scope === 'PRODUCT' && discount.productIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productIds'],
        message: 'Select at least one product for a product-scoped discount',
      });
    }
  });

const updateDiscountSchema = z.object({
  name: discountFields.name.optional(),
  type: z.enum(discountTypes).optional(),
  value: discountFields.value.optional(),
  minPurchase: amountSchema.optional(),
  minQty: z.number().int().min(0).max(2147483647).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  usageLimit: z.number().int().min(1).max(2147483647).nullable().optional(),
  scope: z.enum(discountScopes).optional(),
  isActive: z.boolean().optional(),
  productIds: productIdsSchema.optional(),
}).strict().superRefine((discount, context) => {
  if (discount.type === 'PERCENT' && discount.value !== undefined && Number(discount.value) > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Percentage discount cannot exceed 100',
    });
  }
  if (
    discount.startDate
    && discount.endDate
    && discount.endDate < discount.startDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'Discount end date must be on or after the start date',
    });
  }
}).refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field must be provided',
});

const discountParamsSchema = z.object({ id: z.string().uuid() });
const discountListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

router.use(requireAuth);

router.get(
  '/discounts',
  requireRole('ADMIN', 'STAFF'),
  validate({ query: discountListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const { discounts: items, total } = await discounts.listDiscounts({ limit, offset });
    res.json(pageResult(items, page, pageSize, total));
  })
);

router.get(
  '/discounts/:id',
  requireRole('ADMIN', 'STAFF'),
  validate({ params: discountParamsSchema }),
  asyncHandler(async (req, res) => {
    const discount = await discounts.getDiscount(req.params.id);
    res.json({ data: discount });
  })
);

router.post(
  '/discounts',
  requireRole('ADMIN'),
  validate(createDiscountSchema),
  asyncHandler(async (req, res) => {
    const discount = await discounts.createDiscount(req.body);
    res.status(201).json({ data: discount });
  })
);

router.patch(
  '/discounts/:id',
  requireRole('ADMIN'),
  validate({ params: discountParamsSchema }),
  validate(updateDiscountSchema),
  asyncHandler(async (req, res) => {
    const discount = await discounts.updateDiscount(req.params.id, req.body);
    res.json({ data: discount });
  })
);

router.delete(
  '/discounts/:id',
  requireRole('ADMIN'),
  validate({ params: discountParamsSchema }),
  asyncHandler(async (req, res) => {
    try {
      const deleted = await discounts.deleteDiscount(req.params.id);
      res.json({ data: deleted });
    } catch (error) {
      discounts.mapDiscountDatabaseError(error);
    }
  })
);

module.exports = router;
