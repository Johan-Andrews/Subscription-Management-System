const express = require('express');
const router = express.Router();
const asyncHandler = require('../../lib/asyncHandler');
const { conflict, badRequest } = require('../../lib/errors');
const supabaseAdmin = require('../../lib/supabaseAdmin');
const { query, withTransaction } = require('../../db/pool');
const requireAuth = require('../../middleware/requireAuth');
const validate = require('../../middleware/validate');
const { signupSchema, resetPasswordSchema } = require('./auth.validation');

/**
 * POST /api/auth/signup
 * Creates a new customer account, Supabase auth user, profile (role CUSTOMER) and customer record.
 */
router.post(
  '/auth/signup',
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const { email, password, fullName, phone } = req.body;

    // 1. Check duplicate email in profiles
    const existing = await query('SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      throw conflict('An account with this email already exists.');
    }

    // 2. Create the user in Supabase Auth
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
      throw badRequest(authError.message || 'Failed to create user account');
    }

    const authUserId = authData.user.id;

    // 3. Insert into profiles and customers inside a database transaction
    try {
      const result = await withTransaction(async (client) => {
        // Role is forced to CUSTOMER regardless of what is in the request body
        const profileRes = await client.query(
          `INSERT INTO profiles (id, email, full_name, phone, role, is_active)
           VALUES ($1, $2, $3, $4, 'CUSTOMER', true)
           RETURNING id, email, full_name, role, is_active, created_at`,
          [authUserId, email, fullName, phone || null]
        );

        const customerRes = await client.query(
          `INSERT INTO customers (user_id, name, email, phone)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [authUserId, fullName, email, phone || null]
        );

        return {
          ...profileRes.rows[0],
          customerId: customerRes.rows[0].id,
        };
      });

      return res.status(201).json({
        data: {
          id: result.id,
          email: result.email,
          fullName: result.full_name,
          role: result.role,
          customerId: result.customerId,
        },
      });
    } catch (dbErr) {
      // Rollback Supabase auth user if database insertion fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch (cleanupErr) {
        console.error('Failed to rollback created auth user:', cleanupErr);
      }
      throw dbErr;
    }
  })
);

/**
 * POST /api/auth/reset-password
 * Requires a valid Supabase recovery token (via requireAuth), validates password rules, and updates password.
 */
router.post(
  '/auth/reset-password',
  requireAuth,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { password } = req.body;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password,
    });

    if (error) {
      throw badRequest(error.message || 'Failed to update password');
    }

    return res.json({
      data: {
        success: true,
        message: 'Password has been reset successfully.',
      },
    });
  })
);

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile and customerId.
 */
router.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      data: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
        role: req.user.role,
        customerId: req.user.customerId,
      },
    });
  })
);

module.exports = router;
