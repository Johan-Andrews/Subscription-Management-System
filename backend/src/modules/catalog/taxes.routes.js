const express = require('express');
const { z } = require('zod');
const { query } = require('../../db/pool');
const asyncHandler = require('../../lib/asyncHandler');
const { notFound } = require('../../lib/errors');
const { pageResult, parsePaging } = require('../../lib/pagination');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');

const router = express.Router();

const taxTypeSchema = z.enum(['PERCENT', 'FIXED']);
const rateSchema = z.number()
  .finite()
  .min(0)
  .max(999999.99)
  .refine((rate) => /^\d+(\.\d{1,2})?$/.test(String(rate)), {
    message: 'Rate must have no more than two decimal places',
  });

const createTaxSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: taxTypeSchema,
  rate: rateSchema,
  isActive: z.boolean().optional(),
}).strict();

const updateTaxSchema = createTaxSchema.partial()
  .refine((tax) => Object.keys(tax).length > 0, {
    message: 'At least one field must be provided',
  });
const taxParamsSchema = z.object({ id: z.string().uuid() });

const taxFields = `
  id,
  name,
  type,
  rate,
  is_active,
  created_at,
  updated_at
`;

const toTax = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  rate: row.rate,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.use(requireAuth);

router.get('/taxes', requireRole('ADMIN', 'STAFF'), asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = parsePaging(req.query);
  const [taxesResult, countResult] = await Promise.all([
    query(
      `SELECT ${taxFields}
       FROM taxes
       ORDER BY name ASC, id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query('SELECT COUNT(*) FROM taxes'),
  ]);

  const taxes = taxesResult.rows.map(toTax);
  res.json(pageResult(taxes, page, pageSize, countResult.rows[0].count));
}));

router.get(
  '/taxes/:id',
  requireRole('ADMIN', 'STAFF'),
  validate({ params: taxParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT ${taxFields} FROM taxes WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw notFound('Tax not found');
    }

    res.json({ data: toTax(result.rows[0]) });
  })
);

router.post(
  '/taxes',
  requireRole('ADMIN'),
  validate(createTaxSchema),
  asyncHandler(async (req, res) => {
    const { name, type, rate, isActive = true } = req.body;
    const result = await query(
      `INSERT INTO taxes (name, type, rate, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING ${taxFields}`,
      [name, type, rate, isActive]
    );

    res.status(201).json({ data: toTax(result.rows[0]) });
  })
);

router.patch(
  '/taxes/:id',
  requireRole('ADMIN'),
  validate({ params: taxParamsSchema }),
  validate(updateTaxSchema),
  asyncHandler(async (req, res) => {
    const updates = req.body;
    const columns = {
      name: 'name',
      type: 'type',
      rate: 'rate',
      isActive: 'is_active',
    };
    const values = [];
    const assignments = Object.entries(updates).map(([field, value]) => {
      values.push(value);
      return `${columns[field]} = $${values.length}`;
    });

    values.push(req.params.id);
    const result = await query(
      `UPDATE taxes
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING ${taxFields}`,
      values
    );

    if (result.rows.length === 0) {
      throw notFound('Tax not found');
    }

    res.json({ data: toTax(result.rows[0]) });
  })
);

router.delete(
  '/taxes/:id',
  requireRole('ADMIN'),
  validate({ params: taxParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE taxes
       SET is_active = false, updated_at = now()
       WHERE id = $1
       RETURNING ${taxFields}`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw notFound('Tax not found');
    }

    res.json({ data: toTax(result.rows[0]) });
  })
);

module.exports = router;
