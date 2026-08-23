import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(res, 'Authentication required. No token provided.', 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return ApiResponse.error(res, 'Authentication required. Malformed token.', 401);
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      return ApiResponse.error(res, 'Invalid token payload.', 401);
    }

    const user = await User.findById(userId);

    if (!user || !user.isActive) {
      return ApiResponse.error(res, 'User account not found or inactive.', 401);
    }

    // Attach user to request (strip password before passing)
    user.password = undefined;
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.error(res, 'Token expired. Please login again.', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.error(res, 'Invalid token. Authorization denied.', 401);
    }
    return next(error);
  }
};

// Backwards compatibility alias
export const authenticate = requireAuth;

