import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Get all users in the system (Admin only)
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    return ApiResponse.success(res, { users, total: users.length }, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get system statistics and metrics (Admin only)
 */
export const getAdminStats = async (req, res, next) => {
  try {
    const [totalUsers, totalPatients, totalDoctors, totalAppointments, confirmedAppointments] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'doctor' }),
      Appointment.countDocuments(),
      Appointment.countDocuments({ status: 'confirmed' }),
    ]);

    return ApiResponse.success(
      res,
      {
        stats: {
          totalUsers,
          totalPatients,
          totalDoctors,
          totalAppointments,
          confirmedAppointments,
        },
      },
      'Admin statistics retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle user active status (Admin only)
 */
export const toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return ApiResponse.error(res, 'User not found', 404);
    }

    user.isActive = !user.isActive;
    await user.save();

    return ApiResponse.success(
      res,
      { user: { id: user._id, name: user.name, email: user.email, isActive: user.isActive } },
      `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};
