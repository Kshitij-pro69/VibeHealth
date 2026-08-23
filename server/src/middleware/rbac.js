import { ApiResponse } from '../utils/apiResponse.js';

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthenticated. Role check failed.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return ApiResponse.error(
        res,
        `Forbidden: Role '${req.user.role}' is not authorized to access this resource.`,
        403
      );
    }

    next();
  };
};

export const requirePatient = requireRole('patient');
export const requireDoctor = requireRole('doctor');
export const requireAdmin = requireRole('admin');
export const requireDoctorOrAdmin = requireRole('doctor', 'admin');
