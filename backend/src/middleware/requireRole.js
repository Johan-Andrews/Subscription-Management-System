const { forbidden, unauthenticated } = require('../lib/errors');

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(unauthenticated('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(forbidden('You do not have permission to access this resource'));
    }

    next();
  };
};

module.exports = requireRole;

