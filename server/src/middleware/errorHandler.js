import { ApiResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled API Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method,
    code: err.code,
  });

  // 1. MongoDB Duplicate Key Error (E11000) -> Return 409 Conflict
  if (err.code === 11000) {
    const keyPattern = err.keyPattern || {};
    let message = 'A conflict occurred with an existing resource.';

    if (keyPattern.doctorId && keyPattern.startTime) {
      message = 'This appointment time slot is already reserved or booked. Please select a different slot.';
    } else if (keyPattern.email) {
      message = 'An account with this email address already exists.';
    } else if (keyPattern.userId) {
      message = 'A profile for this user already exists.';
    }

    return ApiResponse.error(res, message, 409, {
      code: 'DUPLICATE_KEY_CONFLICT',
      conflictingKeys: Object.keys(keyPattern),
    });
  }

  // 2. Mongoose Schema Validation Error -> Return 400
  if (err.name === 'ValidationError') {
    const validationErrors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));

    return ApiResponse.error(res, 'Database validation error', 400, {
      validationErrors,
    });
  }

  // 3. Mongoose Invalid ObjectId (CastError) -> Return 400
  if (err.name === 'CastError') {
    return ApiResponse.error(res, `Invalid ID format for parameter: ${err.path}`, 400, {
      field: err.path,
      value: err.value,
    });
  }

  // 4. JWT Authentication Errors -> Return 401
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, 'Authentication token is invalid or expired', 401);
  }

  // 5. Default Internal Server Error -> Return 500
  const statusCode = err.statusCode || 500;
  const responseMessage =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'An unexpected internal server error occurred.'
      : err.message || 'Internal Server Error';

  return ApiResponse.error(res, responseMessage, statusCode, {
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
