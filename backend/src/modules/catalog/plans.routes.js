const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../lib/asyncHandler');
const { pageResult, parsePaging } = require('../../lib/pagination');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const plans = require('./plans.service');

const router = express.Router();
const billingPeriods = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

const priceSchema = z.preprocess(
  (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value),
  z.string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Price must be a non-negative amount with up to two decimal places')
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

const planFieldsSchema = {
  name: z.string().trim().min(1).max(160),
  price: priceSchema,
  billingPeriod: z.enum(billingPeriods),
  minQty: z.number().int().min(1).max(2147483647),
  availableFrom: dateSchema,
  availableTo: dateSchema,
  autoClose: z.boolean(),
  closable: z.boolean(),
  pausable: z.boolean(),
  renewable: z.boolean(),
  isActive: z.boolean(),
};

const createPlanSchema = z.object({
  ...planFieldsSchema,
  minQty: planFieldsSchema.minQty.default(1),
  availableFrom: planFieldsSchema.availableFrom.default(null),
  availableTo: planFieldsSchema.availableTo.default(null),
  autoClose: planFieldsSchema.autoClose.default(false),
  closable: planFieldsSchema.closable.default(false),
  pausable: planFieldsSchema.pausable.default(false),
  renewable: planFieldsSchema.renewable.default(false),
  isActive: planFieldsSchema.isActive.default(true),
}).strict().refine(
  ({ availableFrom, availableTo }) => !availableFrom || !availableTo || availableTo >= availableFrom,
  { message: 'Availability end date must be on or after the start date' }
);

const updatePlanSchema = z.object({
  name: planFieldsSchema.name.optional(),
  price: planFieldsSchema.price.optional(),
  billingPeriod: planFieldsSchema.billingPeriod.optional(),
  minQty: planFieldsSchema.minQty.optional(),
  availableFrom: planFieldsSchema.availableFrom.optional(),
  availableTo: planFieldsSchema.availableTo.optional(),
  autoClose: planFieldsSchema.autoClose.optional(),
  closable: planFieldsSchema.closable.optional(),
  pausable: planFieldsSchema.pausable.optional(),
  renewable: planFieldsSchema.renewable.optional(),
  isActive: planFieldsSchema.isActive.optional(),
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field must be provided',
});

const planParamsSchema = z.object({ id: z.string().uuid() });
const planListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(160).optional(),
  billingPeriod: z.enum(billingPeriods).optional(),
}).strict();

router.use(requireAuth);

router.get(
  '/plans/available',
  requireRole('ADMIN', 'STAFF'),
  validate({ query: planListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const { plans: items, total } = await plans.listPlans({
      availableOnly: true,
      search: req.query.search,
      billingPeriod: req.query.billingPeriod,
      limit,
      offset,
    });
    res.json(pageResult(items, page, pageSize, total));
  })
);

router.get(
  '/plans',
  requireRole('ADMIN', 'STAFF'),
  validate({ query: planListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const { plans: items, total } = await plans.listPlans({
      search: req.query.search,
      billingPeriod: req.query.billingPeriod,
      limit,
      offset,
    });
    res.json(pageResult(items, page, pageSize, total));
  })
);

router.get(
  '/plans/:id',
  requireRole('ADMIN', 'STAFF'),
  validate({ params: planParamsSchema }),
  asyncHandler(async (req, res) => {
    const plan = await plans.getPlan(req.params.id);
    res.json({ data: plan });
  })
);

router.post(
  '/plans',
  requireRole('ADMIN'),
  validate(createPlanSchema),
  asyncHandler(async (req, res) => {
    const plan = await plans.createPlan(req.body);
    res.status(201).json({ data: plan });
  })
);

router.patch(
  '/plans/:id',
  requireRole('ADMIN'),
  validate({ params: planParamsSchema }),
  validate(updatePlanSchema),
  asyncHandler(async (req, res) => {
    const plan = await plans.updatePlan(req.params.id, req.body);
    res.json({ data: plan });
  })
);

router.delete(
  '/plans/:id',
  requireRole('ADMIN'),
  validate({ params: planParamsSchema }),
  asyncHandler(async (req, res) => {
    try {
      const deleted = await plans.deletePlan(req.params.id);
      res.json({ data: deleted });
    } catch (error) {
      plans.mapPlanDatabaseError(error);
    }
  })
);

module.exports = router;
