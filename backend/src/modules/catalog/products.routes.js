const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../lib/asyncHandler');
const { conflict } = require('../../lib/errors');
const { pageResult, parsePaging } = require('../../lib/pagination');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const products = require('./products.service');

const router = express.Router();
const productTypes = ['SERVICE', 'SOFTWARE', 'ADDON', 'GOODS'];

const moneySchema = z.number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(String(value)), {
    message: 'Amount must have no more than two decimal places',
  });

const variantSchema = z.object({
  attribute: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
  extraPrice: moneySchema,
}).strict();
const variantsSchema = z.array(variantSchema)
  .max(100)
  .refine((variants) => {
    const keys = variants.map(({ attribute, value }) => (
      `${attribute}\u0000${value}`
    ));
    return new Set(keys).size === keys.length;
  }, {
    message: 'Variant attribute and value combinations must be unique',
  });

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(productTypes),
  salesPrice: moneySchema,
  costPrice: moneySchema.default(0),
  notes: z.string().trim().max(5000).nullable().default(null),
  taxId: z.string().uuid().nullable().default(null),
  variants: variantsSchema.default([]),
  isActive: z.boolean().default(true),
}).strict();

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  type: z.enum(productTypes).optional(),
  salesPrice: moneySchema.optional(),
  costPrice: moneySchema.optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  taxId: z.string().uuid().nullable().optional(),
  variants: variantsSchema.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field must be provided',
});

const productIdParamsSchema = z.object({ id: z.string().uuid() });
const variantIdParamsSchema = z.object({ variantId: z.string().uuid() });
const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(160).optional(),
  type: z.enum(productTypes).optional(),
}).strict();

const createVariantSchema = variantSchema;
const updateVariantSchema = z.object({
  attribute: z.string().trim().min(1).max(80).optional(),
  value: z.string().trim().min(1).max(120).optional(),
  extraPrice: moneySchema.optional(),
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field must be provided',
});

function mapDatabaseConflict(error, message) {
  if (error.code === '23505') {
    throw conflict(message);
  }
  if (error.code === '23503') {
    throw conflict('This catalog item is still in use and cannot be removed.');
  }
  throw error;
}

router.use(requireAuth);

router.get(
  '/products',
  requireRole('ADMIN', 'STAFF'),
  validate({ query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const { products: items, total } = await products.listProducts({
      search: req.query.search,
      type: req.query.type,
      limit,
      offset,
    });
    res.json(pageResult(items, page, pageSize, total));
  })
);

router.get(
  '/products/:id',
  requireRole('ADMIN', 'STAFF'),
  validate({ params: productIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const product = await products.getProduct(req.params.id);
    res.json({ data: product });
  })
);

router.post(
  '/products',
  requireRole('ADMIN'),
  validate(createProductSchema),
  asyncHandler(async (req, res) => {
    try {
      const product = await products.createProduct(req.body);
      res.status(201).json({ data: product });
    } catch (error) {
      mapDatabaseConflict(error, 'A product variant with this attribute and value already exists.');
    }
  })
);

router.patch(
  '/products/:id',
  requireRole('ADMIN'),
  validate({ params: productIdParamsSchema }),
  validate(updateProductSchema),
  asyncHandler(async (req, res) => {
    try {
      const product = await products.updateProduct(req.params.id, req.body);
      res.json({ data: product });
    } catch (error) {
      mapDatabaseConflict(error, 'A product variant with this attribute and value already exists.');
    }
  })
);

router.delete(
  '/products/:id',
  requireRole('ADMIN'),
  validate({ params: productIdParamsSchema }),
  asyncHandler(async (req, res) => {
    try {
      const deleted = await products.deleteProduct(req.params.id);
      res.json({ data: deleted });
    } catch (error) {
      mapDatabaseConflict(error, 'This product is still in use. Deactivate it by setting isActive to false instead.');
    }
  })
);

router.post(
  '/products/:id/variants',
  requireRole('ADMIN'),
  validate({ params: productIdParamsSchema }),
  validate(createVariantSchema),
  asyncHandler(async (req, res) => {
    try {
      const variant = await products.createVariant(req.params.id, req.body);
      res.status(201).json({ data: variant });
    } catch (error) {
      mapDatabaseConflict(error, 'A variant with this attribute and value already exists for the product.');
    }
  })
);

router.patch(
  '/variants/:variantId',
  requireRole('ADMIN'),
  validate({ params: variantIdParamsSchema }),
  validate(updateVariantSchema),
  asyncHandler(async (req, res) => {
    try {
      const variant = await products.updateVariant(req.params.variantId, req.body);
      res.json({ data: variant });
    } catch (error) {
      mapDatabaseConflict(error, 'A variant with this attribute and value already exists for the product.');
    }
  })
);

router.delete(
  '/variants/:variantId',
  requireRole('ADMIN'),
  validate({ params: variantIdParamsSchema }),
  asyncHandler(async (req, res) => {
    try {
      const variant = await products.deleteVariant(req.params.variantId);
      res.json({ data: variant });
    } catch (error) {
      mapDatabaseConflict(error, 'This variant is still in use and cannot be removed.');
    }
  })
);

module.exports = router;
