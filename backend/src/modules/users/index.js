const express = require('express');
const router = express.Router();
const asyncHandler = require('../../lib/asyncHandler');
const { conflict, notFound, badRequest } = require('../../lib/errors');
const supabaseAdmin = require('../../lib/supabaseAdmin');
const { query } = require('../../db/pool');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const { parsePaging, pageResult } = require('../../lib/pagination');
const {
  createStaffSchema,
  updateStaffSchema,
  createCustomerSchema,
  updateCustomerSchema,
} = require('./users.validation');

// ==========================================
// STAFF MANAGEMENT (ADMIN ONLY)
// ==========================================

/**
 * GET /api/users/staff
 * Lists all staff and admin members. Admin only.
 */
router.get(
  '/users/staff',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, email, full_name AS "fullName", role, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM profiles
       WHERE role IN ('STAFF', 'ADMIN')
       ORDER BY created_at DESC`
    );

    return res.json({
      data: result.rows,
    });
  })
);

/**
 * POST /api/users/staff
 * Creates a new staff member. Admin only.
 */
router.post(
  '/users/staff',
  requireAuth,
  requireRole('ADMIN'),
  validate(createStaffSchema),
  asyncHandler(async (req, res) => {
    const { email, password, fullName } = req.body;

    // Check duplicate email
    const existing = await query('SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      throw conflict('An account with this email already exists.');
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      if (
        authError.message?.toLowerCase().includes('already') ||
        authError.message?.toLowerCase().includes('registered') ||
        authError.status === 422
      ) {
        throw conflict('An account with this email already exists.');
      }
      throw badRequest(authError.message || 'Failed to create staff account');
    }

    const authUserId = authData.user.id;

    try {
      const profileRes = await query(
        `INSERT INTO profiles (id, email, full_name, role, is_active)
         VALUES ($1, $2, $3, 'STAFF', true)
         RETURNING id, email, full_name AS "fullName", role, is_active AS "isActive", created_at AS "createdAt"`,
        [authUserId, email, fullName]
      );

      return res.status(201).json({
        data: profileRes.rows[0],
      });
    } catch (dbErr) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch (cleanupErr) {
        console.error('Failed to cleanup auth user after staff insert error:', cleanupErr);
      }
      throw dbErr;
    }
  })
);

/**
 * PATCH /api/users/staff/:id
 * Updates a staff member's name or active status. Admin only.
 */
router.patch(
  '/users/staff/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate(updateStaffSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { fullName, isActive } = req.body;

    const existing = await query(
      `SELECT id, role, is_active FROM profiles WHERE id = $1 AND role IN ('STAFF', 'ADMIN')`,
      [id]
    );

    if (existing.rows.length === 0) {
      throw notFound('Staff member not found');
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (fullName !== undefined) {
      updates.push(`full_name = $${idx++}`);
      values.push(fullName);
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      throw badRequest('No fields provided to update');
    }

    values.push(id);
    const updateSql = `
      UPDATE profiles
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, email, full_name AS "fullName", role, is_active AS "isActive", updated_at AS "updatedAt"
    `;

    const result = await query(updateSql, values);
    return res.json({
      data: result.rows[0],
    });
  })
);

// ==========================================
// CUSTOMER MANAGEMENT (ADMIN + STAFF)
// ==========================================

/**
 * GET /api/customers
 * Paginated search and list of customers.
 */
router.get(
  '/customers',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePaging(req.query);
    const search = req.query.search ? String(req.query.search).trim() : '';

    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1 OR c.company ILIKE $1 OR p.full_name ILIKE $1 OR p.email ILIKE $1)`;
    }

    const countRes = await query(
      `SELECT count(*) 
       FROM customers c
       LEFT JOIN profiles p ON c.user_id = p.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataParams = [...params, limit, offset];
    const dataRes = await query(
      `SELECT 
         c.id, 
         c.user_id AS "userId", 
         COALESCE(c.name, p.full_name) AS name, 
         COALESCE(c.email, p.email) AS email, 
         COALESCE(c.phone, p.phone) AS phone, 
         c.company, 
         c.address, 
         c.created_at AS "createdAt", 
         c.updated_at AS "updatedAt"
       FROM customers c
       LEFT JOIN profiles p ON c.user_id = p.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    return res.json(pageResult(dataRes.rows, page, pageSize, total));
  })
);

/**
 * POST /api/customers
 * Creates a customer record (without requiring a login user).
 */
router.post(
  '/customers',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(createCustomerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, phone, company, address } = req.body;

    if (email) {
      const existing = await query('SELECT id FROM customers WHERE LOWER(email) = LOWER($1)', [email]);
      if (existing.rows.length > 0) {
        throw conflict('A customer with this email already exists.');
      }
    }

    const result = await query(
      `INSERT INTO customers (name, email, phone, company, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id AS "userId", name, email, phone, company, address, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, email || null, phone || null, company || null, address || null]
    );

    return res.status(201).json({
      data: result.rows[0],
    });
  })
);

/**
 * GET /api/customers/:id
 * Fetches customer details.
 */
router.get(
  '/customers/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, user_id AS "userId", name, email, phone, company, address, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM customers
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw notFound('Customer not found');
    }

    return res.json({
      data: result.rows[0],
    });
  })
);

/**
 * PATCH /api/customers/:id
 * Updates customer record.
 */
router.patch(
  '/customers/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(updateCustomerSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, company, address } = req.body;

    const existing = await query('SELECT id, email FROM customers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw notFound('Customer not found');
    }

    if (email && email.toLowerCase() !== existing.rows[0].email?.toLowerCase()) {
      const dup = await query('SELECT id FROM customers WHERE LOWER(email) = LOWER($1) AND id <> $2', [email, id]);
      if (dup.rows.length > 0) {
        throw conflict('A customer with this email already exists.');
      }
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${idx++}`);
      values.push(email || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      values.push(phone || null);
    }
    if (company !== undefined) {
      updates.push(`company = $${idx++}`);
      values.push(company || null);
    }
    if (address !== undefined) {
      updates.push(`address = $${idx++}`);
      values.push(address || null);
    }

    if (updates.length === 0) {
      throw badRequest('No fields provided to update');
    }

    values.push(id);
    const updateSql = `
      UPDATE customers
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, user_id AS "userId", name, email, phone, company, address, created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    const result = await query(updateSql, values);
    return res.json({
      data: result.rows[0],
    });
  })
);

// ==========================================
// LOGGED-IN CUSTOMER PROFILE (/api/me/customer)
// ==========================================

/**
 * GET /api/me/customer
 * Fetches the logged-in customer's own profile.
 */
router.get(
  '/me/customer',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.customerId) {
      throw notFound('Customer profile not found for this user account');
    }

    const result = await query(
      `SELECT id, user_id AS "userId", name, email, phone, company, address, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM customers
       WHERE id = $1`,
      [req.user.customerId]
    );

    if (result.rows.length === 0) {
      throw notFound('Customer profile not found');
    }

    return res.json({
      data: result.rows[0],
    });
  })
);

/**
 * PATCH /api/me/customer
 * Updates the logged-in customer's own profile.
 */
router.patch(
  '/me/customer',
  requireAuth,
  validate(updateCustomerSchema),
  asyncHandler(async (req, res) => {
    if (!req.user.customerId) {
      throw notFound('Customer profile not found for this user account');
    }

    const { name, phone, company, address } = req.body;
    const customerId = req.user.customerId;

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      values.push(phone || null);
    }
    if (company !== undefined) {
      updates.push(`company = $${idx++}`);
      values.push(company || null);
    }
    if (address !== undefined) {
      updates.push(`address = $${idx++}`);
      values.push(address || null);
    }

    if (updates.length === 0) {
      throw badRequest('No fields provided to update');
    }

    values.push(customerId);
    const updateSql = `
      UPDATE customers
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, user_id AS "userId", name, email, phone, company, address, updated_at AS "updatedAt"
    `;

    const result = await query(updateSql, values);

    // Also update full_name on profiles table if name changed
    if (name) {
      await query('UPDATE profiles SET full_name = $1, updated_at = NOW() WHERE id = $2', [name, req.user.id]);
    }

    return res.json({
      data: result.rows[0],
    });
  })
);

module.exports = router;
