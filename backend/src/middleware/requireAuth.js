const supabaseAdmin = require('../lib/supabaseAdmin');
const { query } = require('../db/pool');
const { unauthenticated, forbidden } = require('../lib/errors');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthenticated('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw unauthenticated('Bearer token is missing');
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      throw unauthenticated('Invalid or expired authentication token');
    }

    const result = await query(
      `SELECT p.id, p.email, p.full_name, p.role, p.is_active, c.id AS customer_id
       FROM profiles p
       LEFT JOIN customers c ON c.user_id = p.id
       WHERE p.id = $1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      throw unauthenticated('User profile not found');
    }

    const profile = result.rows[0];
    if (!profile.is_active) {
      throw forbidden('Your account has been deactivated');
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      customerId: profile.customer_id,
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requireAuth;

