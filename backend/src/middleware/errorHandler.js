const { AppError } = require('../lib/errors');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || [],
      },
    });
  }

  // Handle SyntaxError (e.g. malformed JSON in request body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload',
        details: [],
      },
    });
  }

  // Log unexpected errors
  console.error('[UNHANDLED_ERROR]', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : (err.message || 'Internal server error');

  return res.status(statusCode).json({
    error: {
      code: 'INTERNAL',
      message,
      details: [],
    },
  });
};

module.exports = errorHandler;

