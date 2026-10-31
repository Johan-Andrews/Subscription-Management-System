const { badRequest } = require('../lib/errors');

const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      if (schema && typeof schema.parse === 'function') {
        req[source] = schema.parse(req[source]);
      } else if (typeof schema === 'object') {
        if (schema.body && typeof schema.body.parse === 'function') {
          req.body = schema.body.parse(req.body);
        }
        if (schema.query && typeof schema.query.parse === 'function') {
          req.query = schema.query.parse(req.query);
        }
        if (schema.params && typeof schema.params.parse === 'function') {
          req.params = schema.params.parse(req.params);
        }
      }
      next();
    } catch (err) {
      if (err.errors && Array.isArray(err.errors)) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        const firstMessage = err.errors[0]?.message || 'Validation failed';
        return next(badRequest(firstMessage, details));
      }
      return next(badRequest(err.message || 'Validation failed'));
    }
  };
};

module.exports = validate;
