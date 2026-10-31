const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../../db/pool');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../lib/asyncHandler');
const { notFound, badRequest, conflict, forbidden } = require('../../lib/errors');
const { parsePaging, pageResult } = require('../../lib/pagination');
const { toPaise, fromPaise, mulPaise, percentOf } = require('../../lib/money');
const pricingService = require('../catalog/pricing.service');

const router = express.Router();

router.use(requireAuth);

const lineInputSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid('Invalid variant ID').nullable().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
});

const createSubscriptionSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  planId: z.string().uuid('Invalid plan ID').optional(),
  templateId: z.string().uuid('Invalid template ID').nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expiryDate must be YYYY-MM-DD').nullable().optional(),
  paymentTerms: z.enum(['IMMEDIATE', 'NET_15', 'NET_30', 'NET_60']).default('NET_15'),
  notes: z.string().nullable().optional(),
  lines: z.array(lineInputSchema).optional(),
});

const updateSubscriptionSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional(),
  planId: z.string().uuid('Invalid plan ID').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expiryDate must be YYYY-MM-DD').nullable().optional(),
  paymentTerms: z.enum(['IMMEDIATE', 'NET_15', 'NET_30', 'NET_60']).optional(),
  notes: z.string().nullable().optional(),
  quotationValidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'quotationValidUntil must be YYYY-MM-DD').nullable().optional(),
  lines: z.array(lineInputSchema).optional(),
});

/**
 * Snapshot helper: computes unit_price, description, tax snapshot, and line amount
 */
async function buildLineSnapshot(client, line) {
  // 1. Fetch product
  const prRes = await client.query(
    'SELECT id, name, type, sales_price, tax_id FROM products WHERE id = $1',
    [line.productId]
  );
  if (prRes.rows.length === 0) {
    throw badRequest(`Product ${line.productId} not found`);
  }
  const product = prRes.rows[0];

  // 2. Fetch variant if provided
  let variant = null;
  if (line.variantId) {
    const vrRes = await client.query(
      'SELECT id, attribute, value, extra_price FROM product_variants WHERE id = $1 AND product_id = $2',
      [line.variantId, line.productId]
    );
    if (vrRes.rows.length === 0) {
      throw badRequest(`Variant ${line.variantId} does not belong to product ${line.productId}`);
    }
    variant = vrRes.rows[0];
  }

  // 3. Build line description
  const description = variant
    ? `${product.name} (${variant.attribute}: ${variant.value})`
    : product.name;

  // 4. Unit price snapshot (use pricingService with DB fallback)
  let unitPriceStr = await pricingService.getUnitPrice(client, {
    productId: line.productId,
    variantId: line.variantId || null,
  });

  if (!unitPriceStr || unitPriceStr === '0.00') {
    const basePricePaise = toPaise(product.sales_price);
    const extraPricePaise = variant ? toPaise(variant.extra_price) : 0;
    unitPriceStr = fromPaise(basePricePaise + extraPricePaise);
  }

  // 5. Tax snapshot (use pricingService with DB fallback)
  let taxInfo = await pricingService.getTaxForProduct(client, line.productId);
  if (!taxInfo || (!taxInfo.taxId && String(taxInfo.rate) === '0')) {
    if (product.tax_id) {
      const taxRes = await client.query(
        'SELECT id, rate, type FROM taxes WHERE id = $1 AND is_active = true',
        [product.tax_id]
      );
      if (taxRes.rows.length > 0) {
        taxInfo = {
          taxId: taxRes.rows[0].id,
          rate: taxRes.rows[0].rate.toString(),
          type: taxRes.rows[0].type,
        };
      }
    }
  }

  const taxId = taxInfo?.taxId || null;
  const taxRate = taxInfo?.rate ? parseFloat(taxInfo.rate) : 0;
  const taxType = taxInfo?.type || 'PERCENT';

  // 6. Line amount = quantity * unit_price
  const unitPricePaise = toPaise(unitPriceStr);
  const lineAmountPaise = mulPaise(unitPricePaise, line.quantity);
  const amountStr = fromPaise(lineAmountPaise);

  return {
    productId: line.productId,
    variantId: line.variantId || null,
    description,
    quantity: line.quantity,
    unitPrice: unitPriceStr,
    taxId,
    taxRate,
    taxType,
    amount: amountStr,
  };
}

/**
 * GET /api/subscriptions
 * List subscriptions with filters and pagination
 * Customers only see their own subscriptions
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const { status, planId, search } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Enforce customer scoping
    if (req.user.role === 'CUSTOMER') {
      if (!req.user.customerId) {
        return res.json(pageResult([], page, pageSize, 0));
      }
      conditions.push(`s.customer_id = $${paramIndex}`);
      params.push(req.user.customerId);
      paramIndex++;
    } else if (req.query.customerId) {
      conditions.push(`s.customer_id = $${paramIndex}`);
      params.push(req.query.customerId);
      paramIndex++;
    }

    if (status) {
      conditions.push(`s.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (planId) {
      conditions.push(`s.plan_id = $${paramIndex}`);
      params.push(planId);
      paramIndex++;
    }

    if (search && search.trim()) {
      conditions.push(
        `(s.number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex})`
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM subscriptions s
      JOIN customers c ON c.id = s.customer_id
      JOIN plans p ON p.id = s.plan_id
      ${whereClause}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    // List query
    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT
        s.id,
        s.number,
        s.customer_id,
        c.name AS customer_name,
        c.email AS customer_email,
        c.company AS customer_company,
        s.plan_id,
        p.name AS plan_name,
        p.billing_period AS plan_billing_period,
        p.price AS plan_price,
        p.auto_close AS plan_auto_close,
        p.closable AS plan_closable,
        p.pausable AS plan_pausable,
        p.renewable AS plan_renewable,
        s.template_id,
        s.start_date,
        s.expiry_date,
        s.next_billing_date,
        s.payment_terms,
        s.status,
        s.is_paused,
        s.quotation_valid_until,
        s.notes,
        s.created_at,
        s.updated_at,
        COALESCE(SUM(sl.amount), 0) AS subtotal,
        COUNT(sl.id)::int AS line_count
      FROM subscriptions s
      JOIN customers c ON c.id = s.customer_id
      JOIN plans p ON p.id = s.plan_id
      LEFT JOIN subscription_lines sl ON sl.subscription_id = s.id
      ${whereClause}
      GROUP BY s.id, c.id, p.id
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataRes = await query(dataSql, dataParams);

    res.json(pageResult(dataRes.rows, page, pageSize, total));
  })
);

/**
 * GET /api/subscriptions/:id
 * Get single subscription details, lines, totals, customer, plan, and history
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subSql = `
      SELECT
        s.id,
        s.number,
        s.customer_id,
        c.name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.company AS customer_company,
        c.address AS customer_address,
        s.plan_id,
        p.name AS plan_name,
        p.price AS plan_price,
        p.billing_period AS plan_billing_period,
        p.min_qty AS plan_min_qty,
        p.auto_close AS plan_auto_close,
        p.closable AS plan_closable,
        p.pausable AS plan_pausable,
        p.renewable AS plan_renewable,
        s.template_id,
        qt.name AS template_name,
        s.start_date,
        s.expiry_date,
        s.next_billing_date,
        s.payment_terms,
        s.status,
        s.is_paused,
        s.quotation_valid_until,
        s.notes,
        s.created_by,
        s.closed_at,
        s.created_at,
        s.updated_at
      FROM subscriptions s
      JOIN customers c ON c.id = s.customer_id
      JOIN plans p ON p.id = s.plan_id
      LEFT JOIN quotation_templates qt ON qt.id = s.template_id
      WHERE s.id = $1
    `;
    const subRes = await query(subSql, [id]);
    if (subRes.rows.length === 0) {
      throw notFound('Subscription not found');
    }
    const sub = subRes.rows[0];

    // Customer scoping check
    if (req.user.role === 'CUSTOMER' && sub.customer_id !== req.user.customerId) {
      throw notFound('Subscription not found');
    }

    // Fetch lines with product details
    const linesSql = `
      SELECT
        sl.id,
        sl.product_id,
        pr.name AS product_name,
        pr.type AS product_type,
        sl.variant_id,
        pv.attribute AS variant_attribute,
        pv.value AS variant_value,
        sl.description,
        sl.quantity,
        sl.unit_price,
        sl.tax_id,
        t.name AS tax_name,
        sl.tax_rate,
        sl.tax_type,
        sl.amount
      FROM subscription_lines sl
      JOIN products pr ON pr.id = sl.product_id
      LEFT JOIN product_variants pv ON pv.id = sl.variant_id
      LEFT JOIN taxes t ON t.id = sl.tax_id
      WHERE sl.subscription_id = $1
      ORDER BY sl.id ASC
    `;
    const linesRes = await query(linesSql, [id]);
    const lines = linesRes.rows;

    // Calculate totals
    let subtotalPaise = 0;
    let taxTotalPaise = 0;

    const formattedLines = lines.map((line) => {
      const lineAmtPaise = toPaise(line.amount);
      subtotalPaise += lineAmtPaise;

      let lineTaxPaise = 0;
      if (line.tax_type === 'FIXED') {
        lineTaxPaise = toPaise(line.tax_rate);
      } else {
        lineTaxPaise = percentOf(lineAmtPaise, line.tax_rate);
      }
      taxTotalPaise += lineTaxPaise;

      return {
        ...line,
        taxAmount: fromPaise(lineTaxPaise),
        total: fromPaise(lineAmtPaise + lineTaxPaise),
      };
    });

    const totalPaise = subtotalPaise + taxTotalPaise;

    // Fetch status history
    const historySql = `
      SELECT
        h.id,
        h.from_status,
        h.to_status,
        h.action,
        h.changed_at,
        h.changed_by,
        p.full_name AS changed_by_name,
        p.role AS changed_by_role
      FROM subscription_status_history h
      LEFT JOIN profiles p ON p.id = h.changed_by
      WHERE h.subscription_id = $1
      ORDER BY h.changed_at ASC
    `;
    const historyRes = await query(historySql, [id]);

    res.json({
      data: {
        ...sub,
        lines: formattedLines,
        history: historyRes.rows,
        totals: {
          subtotal: fromPaise(subtotalPaise),
          taxTotal: fromPaise(taxTotalPaise),
          total: fromPaise(totalPaise),
        },
      },
    });
  })
);

/**
 * GET /api/subscriptions/:id/history
 * Status timeline for subscription
 */
router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subCheck = await query('SELECT customer_id FROM subscriptions WHERE id = $1', [id]);
    if (subCheck.rows.length === 0) {
      throw notFound('Subscription not found');
    }

    if (req.user.role === 'CUSTOMER' && subCheck.rows[0].customer_id !== req.user.customerId) {
      throw notFound('Subscription not found');
    }

    const historySql = `
      SELECT
        h.id,
        h.from_status,
        h.to_status,
        h.action,
        h.changed_at,
        h.changed_by,
        p.full_name AS changed_by_name,
        p.role AS changed_by_role
      FROM subscription_status_history h
      LEFT JOIN profiles p ON p.id = h.changed_by
      WHERE h.subscription_id = $1
      ORDER BY h.changed_at ASC
    `;
    const historyRes = await query(historySql, [id]);

    res.json({ data: historyRes.rows });
  })
);

/**
 * POST /api/subscriptions
 * Create new subscription in DRAFT status
 * Admin and Staff only
 */
router.post(
  '/',
  requireRole('ADMIN', 'STAFF'),
  validate(createSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const {
      customerId,
      planId: providedPlanId,
      templateId,
      startDate,
      expiryDate,
      paymentTerms,
      notes,
      lines: providedLines,
    } = req.body;

    const created = await withTransaction(async (client) => {
      // 1. Verify customer exists
      const custCheck = await client.query('SELECT id, name FROM customers WHERE id = $1', [
        customerId,
      ]);
      if (custCheck.rows.length === 0) {
        throw badRequest('Customer does not exist');
      }

      let activePlanId = providedPlanId;
      let linesToCreate = providedLines || [];
      let quotationValidUntil = null;

      // 2. If templateId provided, prefill plan and lines if not provided
      if (templateId) {
        const tmplCheck = await client.query(
          `SELECT qt.id, qt.plan_id, qt.validity_days, qt.notes
           FROM quotation_templates qt
           WHERE qt.id = $1 AND qt.is_active = true`,
          [templateId]
        );
        if (tmplCheck.rows.length === 0) {
          throw badRequest('Quotation template does not exist or is inactive');
        }
        const template = tmplCheck.rows[0];

        if (!activePlanId) {
          activePlanId = template.plan_id;
        }

        // Compute quotation_valid_until = today + validity_days
        const validDays = template.validity_days || 30;
        const validUntilDate = new Date();
        validUntilDate.setDate(validUntilDate.getDate() + validDays);
        quotationValidUntil = validUntilDate.toISOString().split('T')[0];

        // If no lines provided explicitly, fetch template lines
        if (linesToCreate.length === 0) {
          const tmplLinesRes = await client.query(
            `SELECT product_id, variant_id, quantity
             FROM quotation_template_lines
             WHERE template_id = $1`,
            [templateId]
          );
          linesToCreate = tmplLinesRes.rows.map((tl) => ({
            productId: tl.product_id,
            variantId: tl.variant_id,
            quantity: tl.quantity,
          }));
        }
      }

      if (!activePlanId) {
        throw badRequest('Plan ID is required');
      }

      // 3. Verify plan
      const planRes = await client.query(
        'SELECT id, name, min_qty, is_active FROM plans WHERE id = $1',
        [activePlanId]
      );
      if (planRes.rows.length === 0) {
        throw badRequest('Plan does not exist');
      }
      const plan = planRes.rows[0];

      // 4. Validate lines count and min quantity
      if (!linesToCreate || linesToCreate.length === 0) {
        throw badRequest('Subscription must have at least one product line');
      }

      const totalQuantity = linesToCreate.reduce(
        (sum, l) => sum + (parseInt(l.quantity, 10) || 0),
        0
      );
      if (totalQuantity < plan.min_qty) {
        throw badRequest(
          `Total line quantity (${totalQuantity}) must meet the plan minimum quantity (${plan.min_qty})`
        );
      }

      // Validate expiryDate >= startDate if provided
      if (expiryDate && expiryDate < startDate) {
        throw badRequest('Expiry date cannot be earlier than start date');
      }

      // 5. Insert subscription (number auto-generated by sequence default in DB)
      const subInsertSql = `
        INSERT INTO subscriptions (
          customer_id,
          plan_id,
          template_id,
          start_date,
          expiry_date,
          payment_terms,
          status,
          is_paused,
          quotation_valid_until,
          notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', false, $7, $8, $9)
        RETURNING *
      `;
      const subRes = await client.query(subInsertSql, [
        customerId,
        activePlanId,
        templateId || null,
        startDate,
        expiryDate || null,
        paymentTerms || 'NET_15',
        quotationValidUntil,
        notes || null,
        req.user.id,
      ]);
      const newSub = subRes.rows[0];

      // 6. Create line snapshots
      const insertedLines = [];
      for (const line of linesToCreate) {
        const snapshot = await buildLineSnapshot(client, line);
        const lineInsertSql = `
          INSERT INTO subscription_lines (
            subscription_id,
            product_id,
            variant_id,
            description,
            quantity,
            unit_price,
            tax_id,
            tax_rate,
            tax_type,
            amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8)
          RETURNING *
        `;
        // Note: amount is $8 above? Wait, let's pass all 10 params correctly!
        const lineRes = await client.query(
          `INSERT INTO subscription_lines (
            subscription_id,
            product_id,
            variant_id,
            description,
            quantity,
            unit_price,
            tax_id,
            tax_rate,
            tax_type,
            amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            newSub.id,
            snapshot.productId,
            snapshot.variantId,
            snapshot.description,
            snapshot.quantity,
            snapshot.unitPrice,
            snapshot.taxId,
            snapshot.taxRate,
            snapshot.taxType,
            snapshot.amount,
          ]
        );
        insertedLines.push(lineRes.rows[0]);
      }

      // 7. Write first status history row
      await client.query(
        `INSERT INTO subscription_status_history (
          subscription_id,
          from_status,
          to_status,
          action,
          changed_by
        ) VALUES ($1, NULL, 'DRAFT', 'create', $2)`,
        [newSub.id, req.user.id]
      );

      newSub.lines = insertedLines;
      return newSub;
    });

    res.status(201).json({ data: created });
  })
);

/**
 * PATCH /api/subscriptions/:id
 * Edit subscription details & lines while in DRAFT or QUOTATION status
 * Admin and Staff only
 */
router.patch(
  '/:id',
  requireRole('ADMIN', 'STAFF'),
  validate(updateSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      customerId,
      planId,
      startDate,
      expiryDate,
      paymentTerms,
      notes,
      quotationValidUntil,
      lines,
    } = req.body;

    const updated = await withTransaction(async (client) => {
      // 1. Lock and check subscription
      const existingRes = await client.query(
        'SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (existingRes.rows.length === 0) {
        throw notFound('Subscription not found');
      }
      const existing = existingRes.rows[0];

      // Only editable while DRAFT or QUOTATION
      if (!['DRAFT', 'QUOTATION'].includes(existing.status)) {
        throw conflict(
          `Subscriptions can only be modified in DRAFT or QUOTATION status (current: ${existing.status})`
        );
      }

      // 2. Validate customer if changing
      if (customerId && customerId !== existing.customer_id) {
        const custCheck = await client.query('SELECT id FROM customers WHERE id = $1', [
          customerId,
        ]);
        if (custCheck.rows.length === 0) {
          throw badRequest('Customer does not exist');
        }
      }

      // 3. Validate plan if changing or for min_qty
      const targetPlanId = planId || existing.plan_id;
      const planRes = await client.query('SELECT id, min_qty FROM plans WHERE id = $1', [
        targetPlanId,
      ]);
      if (planRes.rows.length === 0) {
        throw badRequest('Plan does not exist');
      }
      const plan = planRes.rows[0];

      // Validate date constraints
      const targetStartDate = startDate || existing.start_date;
      const targetExpiryDate = expiryDate !== undefined ? expiryDate : existing.expiry_date;
      if (targetExpiryDate && targetStartDate && targetExpiryDate < targetStartDate) {
        throw badRequest('Expiry date cannot be earlier than start date');
      }

      // 4. Update subscription header
      const updates = [];
      const params = [];
      let paramIdx = 1;

      if (customerId !== undefined) {
        updates.push(`customer_id = $${paramIdx++}`);
        params.push(customerId);
      }
      if (planId !== undefined) {
        updates.push(`plan_id = $${paramIdx++}`);
        params.push(planId);
      }
      if (startDate !== undefined) {
        updates.push(`start_date = $${paramIdx++}`);
        params.push(startDate);
      }
      if (expiryDate !== undefined) {
        updates.push(`expiry_date = $${paramIdx++}`);
        params.push(expiryDate);
      }
      if (paymentTerms !== undefined) {
        updates.push(`payment_terms = $${paramIdx++}`);
        params.push(paymentTerms);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramIdx++}`);
        params.push(notes);
      }
      if (quotationValidUntil !== undefined) {
        updates.push(`quotation_valid_until = $${paramIdx++}`);
        params.push(quotationValidUntil);
      }

      updates.push(`updated_at = now()`);
      params.push(id);

      const updateSql = `
        UPDATE subscriptions
        SET ${updates.join(', ')}
        WHERE id = $${paramIdx}
        RETURNING *
      `;
      const updatedSubRes = await client.query(updateSql, params);
      const updatedSub = updatedSubRes.rows[0];

      // 5. If lines are provided, recompute snapshots and atomically replace
      if (lines !== undefined) {
        if (!lines || lines.length === 0) {
          throw badRequest('Subscription must have at least one product line');
        }

        const totalQuantity = lines.reduce(
          (sum, l) => sum + (parseInt(l.quantity, 10) || 0),
          0
        );
        if (totalQuantity < plan.min_qty) {
          throw badRequest(
            `Total line quantity (${totalQuantity}) must meet the plan minimum quantity (${plan.min_qty})`
          );
        }

        // Delete existing lines
        await client.query('DELETE FROM subscription_lines WHERE subscription_id = $1', [id]);

        const insertedLines = [];
        for (const line of lines) {
          const snapshot = await buildLineSnapshot(client, line);
          const lineRes = await client.query(
            `INSERT INTO subscription_lines (
              subscription_id,
              product_id,
              variant_id,
              description,
              quantity,
              unit_price,
              tax_id,
              tax_rate,
              tax_type,
              amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
              id,
              snapshot.productId,
              snapshot.variantId,
              snapshot.description,
              snapshot.quantity,
              snapshot.unitPrice,
              snapshot.taxId,
              snapshot.taxRate,
              snapshot.taxType,
              snapshot.amount,
            ]
          );
          insertedLines.push(lineRes.rows[0]);
        }
        updatedSub.lines = insertedLines;
      }

      return updatedSub;
    });

    res.json({ data: updated });
  })
);

module.exports = router;

