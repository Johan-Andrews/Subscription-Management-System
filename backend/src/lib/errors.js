class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL', details = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

const badRequest = (message = 'Bad request', details = []) => {
  return new AppError(message, 400, 'VALIDATION_ERROR', details);
};

const unauthenticated = (message = 'Authentication required', details = []) => {
  return new AppError(message, 401, 'UNAUTHENTICATED', details);
};

const forbidden = (message = 'Access forbidden', details = []) => {
  return new AppError(message, 403, 'FORBIDDEN', details);
};

const notFound = (message = 'Resource not found', details = []) => {
  return new AppError(message, 404, 'NOT_FOUND', details);
};

const conflict = (message = 'Resource conflict', details = []) => {
  return new AppError(message, 409, 'CONFLICT', details);
};

const internal = (message = 'Internal server error', details = []) => {
  return new AppError(message, 500, 'INTERNAL', details);
};

module.exports = {
  AppError,
  badRequest,
  unauthenticated,
  forbidden,
  notFound,
  conflict,
  internal,
};
