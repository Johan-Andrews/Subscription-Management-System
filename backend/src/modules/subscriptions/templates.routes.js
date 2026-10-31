const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../../db/pool');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../lib/asyncHandler');
const { notFound, badRequest } = require('../../lib/errors');
const { parsePaging, pageResult } = require('../../lib/pagination');

const router = express.Router();

// All quotation template endpoints are accessible by Admin and Staff
router.use(requireAuth);
router.use(requireRole('ADMIN', 'STAFF'));

const templateLineSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid('Invalid variant ID').nullable().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
});

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  planId: z.string().uuid('Invalid plan ID'),
  validityDays: z.number().int().min(1, 'Validity days must be at least 1').default(30),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  lines: z.array(templateLineSchema).optional().default([]),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255).optional(),
  planId: z.string().uuid('Invalid plan ID').optional(),
  validityDays: z.number().int().min(1, 'Validity days must be at least 1').optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  lines: z.array(templateLineSchema).optional(),
});

/**
 * GET /api/quotation-templates
 * List quotation templates with plan details and line count
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const { search, planId, isActive } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      conditions.push(`(qt.name ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (planId) {
      conditions.push(`qt.plan_id = $${paramIndex}`);
      params.push(planId);
      paramIndex++;
    }

    if (isActive !== undefined && isActive !== '') {
      conditions.push(`qt.is_active = $${paramIndex}`);
      params.push(isActive === 'true' || isActive === true);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM quotation_templates qt
      JOIN plans p ON p.id = qt.plan_id
      ${whereClause}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    // Data query
    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT
        qt.id,
        qt.name,
        qt.plan_id,
        p.name AS plan_name,
        p.price AS plan_price,
        p.billing_period AS plan_billing_period,
        qt.validity_days,
        qt.notes,
        qt.is_active,
        qt.created_at,
        qt.updated_at,
        COUNT(qtl.id)::int AS line_count
      FROM quotation_templates qt
      JOIN plans p ON p.id = qt.plan_id
      LEFT JOIN quotation_template_lines qtl ON qtl.template_id = qt.id
      ${whereClause}
      GROUP BY qt.id, p.id
      ORDER BY qt.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataRes = await query(dataSql, dataParams);

    res.json(pageResult(dataRes.rows, page, pageSize, total));
  })
);

/**
 * GET /api/quotation-templates/:id
 * Get full template with lines and product/variant details
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const templateSql = `
      SELECT
        qt.id,
        qt.name,
        qt.plan_id,
        p.name AS plan_name,
        p.price AS plan_price,
        p.billing_period AS plan_billing_period,
        p.min_qty AS plan_min_qty,
        qt.validity_days,
        qt.notes,
        qt.is_active,
        qt.created_at,
        qt.updated_at
      FROM quotation_templates qt
      JOIN plans p ON p.id = qt.plan_id
      WHERE qt.id = $1
    `;
    const templateRes = await query(templateSql, [id]);
    if (templateRes.rows.length === 0) {
      throw notFound('Quotation template not found');
    }
    const template = templateRes.rows[0];

    const linesSql = `
      SELECT
        qtl.id,
        qtl.product_id,
        pr.name AS product_name,
        pr.type AS product_type,
        pr.sales_price,
        qtl.variant_id,
        pv.attribute AS variant_attribute,
        pv.value AS variant_value,
        COALESCE(pv.extra_price, 0) AS variant_extra_price,
        (pr.sales_price + COALESCE(pv.extra_price, 0)) AS unit_price,
        qtl.quantity
      FROM quotation_template_lines qtl
      JOIN products pr ON pr.id = qtl.product_id
      LEFT JOIN product_variants pv ON pv.id = qtl.variant_id
      WHERE qtl.template_id = $1
      ORDER BY qtl.id ASC
    `;
    const linesRes = await query(linesSql, [id]);
    template.lines = linesRes.rows;

    res.json({ data: template });
  })
);

/**
 * POST /api/quotation-templates
 * Create a new quotation template with lines atomically
 */
router.post(
  '/',
  validate(createTemplateSchema),
  asyncHandler(async (req, res) => {
    const { name, planId, validityDays, notes, isActive, lines } = req.body;

    const createdTemplate = await withTransaction(async (client) => {
      // 1. Verify plan exists
      const planCheck = await client.query(
        'SELECT id, name, is_active FROM plans WHERE id = $1',
        [planId]
      );
      if (planCheck.rows.length === 0) {
        throw badRequest('Plan does not exist');
      }

      // 2. Insert quotation template
      const insertSql = `
        INSERT INTO quotation_templates (name, plan_id, validity_days, notes, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const templateRes = await client.query(insertSql, [
        name,
        planId,
        validityDays || 30,
        notes || null,
        isActive !== undefined ? isActive : true,
      ]);
      const template = templateRes.rows[0];

      // 3. Insert lines
      const insertedLines = [];
      if (lines && lines.length > 0) {
        for (const line of lines) {
          // Verify product
          const prCheck = await client.query(
            'SELECT id, name, sales_price FROM products WHERE id = $1',
            [line.productId]
          );
          if (prCheck.rows.length === 0) {
            throw badRequest(`Product with id ${line.productId} does not exist`);
          }

          // Verify variant if given
          if (line.variantId) {
            const pvCheck = await client.query(
              'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
              [line.variantId, line.productId]
            );
            if (pvCheck.rows.length === 0) {
              throw badRequest(
                `Variant ${line.variantId} does not belong to product ${line.productId}`
              );
            }
          }

          const lineInsert = `
            INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity)
            VALUES ($1, $2, $3, $4)
            RETURNING *
          `;
          const lineRes = await client.query(lineInsert, [
            template.id,
            line.productId,
            line.variantId || null,
            line.quantity || 1,
          ]);
          insertedLines.push(lineRes.rows[0]);
        }
      }

      template.lines = insertedLines;
      return template;
    });

    res.status(201).json({ data: createdTemplate });
  })
);

/**
 * PATCH /api/quotation-templates/:id
 * Update template details and replace lines atomically
 */
router.patch(
  '/:id',
  validate(updateTemplateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, planId, validityDays, notes, isActive, lines } = req.body;

    const updated = await withTransaction(async (client) => {
      // 1. Check template exists
      const existing = await client.query(
        'SELECT * FROM quotation_templates WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (existing.rows.length === 0) {
        throw notFound('Quotation template not found');
      }

      // 2. Validate plan if changed
      if (planId) {
        const planCheck = await client.query('SELECT id FROM plans WHERE id = $1', [planId]);
        if (planCheck.rows.length === 0) {
          throw badRequest('Plan does not exist');
        }
      }

      // 3. Update template fields
      const updates = [];
      const params = [];
      let paramIdx = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
      }
      if (planId !== undefined) {
        updates.push(`plan_id = $${paramIdx++}`);
        params.push(planId);
      }
      if (validityDays !== undefined) {
        updates.push(`validity_days = $${paramIdx++}`);
        params.push(validityDays);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramIdx++}`);
        params.push(notes);
      }
      if (isActive !== undefined) {
        updates.push(`is_active = $${paramIdx++}`);
        params.push(isActive);
      }

      updates.push(`updated_at = now()`);
      params.push(id);

      const updateSql = `
        UPDATE quotation_templates
        SET ${updates.join(', ')}
        WHERE id = $${paramIdx}
        RETURNING *
      `;
      const updatedTemplateRes = await client.query(updateSql, params);
      const template = updatedTemplateRes.rows[0];

      // 4. Atomically replace lines if provided
      if (lines !== undefined) {
        await client.query('DELETE FROM quotation_template_lines WHERE template_id = $1', [id]);

        const insertedLines = [];
        for (const line of lines) {
          // Verify product
          const prCheck = await client.query('SELECT id FROM products WHERE id = $1', [
            line.productId,
          ]);
          if (prCheck.rows.length === 0) {
            throw badRequest(`Product with id ${line.productId} does not exist`);
          }

          if (line.variantId) {
            const pvCheck = await client.query(
              'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
              [line.variantId, line.productId]
            );
            if (pvCheck.rows.length === 0) {
              throw badRequest(
                `Variant ${line.variantId} does not belong to product ${line.productId}`
              );
            }
          }

          const lineInsert = `
            INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity)
            VALUES ($1, $2, $3, $4)
            RETURNING *
          `;
          const lineRes = await client.query(lineInsert, [
            id,
            line.productId,
            line.variantId || null,
            line.quantity || 1,
          ]);
          insertedLines.push(lineRes.rows[0]);
        }
        template.lines = insertedLines;
      }

      return template;
    });

    res.json({ data: updated });
  })
);

/**
 * DELETE /api/quotation-templates/:id
 * Delete or soft-disable template
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await query('SELECT id FROM quotation_templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw notFound('Quotation template not found');
    }

    // Check if referenced by any subscriptions
    const subCheck = await query(
      'SELECT id FROM subscriptions WHERE template_id = $1 LIMIT 1',
      [id]
    );

    if (subCheck.rows.length > 0) {
      // Soft disable if referenced
      await query(
        'UPDATE quotation_templates SET is_active = false, updated_at = now() WHERE id = $1',
        [id]
      );
      return res.json({
        data: { message: 'Template is used by subscriptions; soft-disabled (isActive=false)' },
      });
    }

    // Otherwise cascade delete
    await query('DELETE FROM quotation_templates WHERE id = $1', [id]);
    res.json({ data: { message: 'Quotation template deleted successfully' } });
  })
);

module.exports = router;

