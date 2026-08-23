import { ApiResponse } from '../utils/apiResponse.js';
import { Appointment } from '../models/Appointment.js';

export const requireAppointmentOwnership = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return ApiResponse.error(res, 'Appointment ID parameter is required.', 400);
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return ApiResponse.error(res, 'Appointment not found.', 404);
    }

    // Admin has universal override
    if (req.user.role === 'admin') {
      req.appointment = appointment;
      return next();
    }

    // Patient can only access their own appointments
    if (req.user.role === 'patient' && appointment.patientId.toString() !== req.user._id.toString()) {
      return ApiResponse.error(res, 'Forbidden: You do not own this appointment.', 403);
    }

    // Doctor can only access appointments assigned to them
    if (req.user.role === 'doctor' && appointment.doctorId.toString() !== req.user._id.toString()) {
      return ApiResponse.error(res, 'Forbidden: This appointment is not assigned to you.', 403);
    }

    req.appointment = appointment;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireUserOwnership = (paramKey = 'userId') => {
  return (req, res, next) => {
    const targetUserId = req.params[paramKey] || req.body[paramKey];

    if (req.user.role === 'admin') {
      return next();
    }

    if (targetUserId && targetUserId.toString() !== req.user._id.toString()) {
      return ApiResponse.error(res, 'Forbidden: You cannot modify another user’s resources.', 403);
    }

    next();
  };
};
