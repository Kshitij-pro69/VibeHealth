import { z } from 'zod';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { dispatchEmailJob } from '../jobs/queue.js';
import { logger } from '../utils/logger.js';

export const createDoctorSchema = z.object({
  name: z.string().min(2, 'Doctor name must have at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8).optional(),
  phone: z.string().optional().default(''),
  specialty: z.string().optional(),
  specialisation: z.string().optional(), // alias
  consultationFee: z.number().min(0, 'Consultation fee must be non-negative'),
  slotDurationMinutes: z.number().min(5).max(180).optional().default(30),
  bufferMinutes: z.number().min(0).max(60).optional().default(0),
  bio: z.string().optional().default(''),
  qualifications: z.array(z.string()).optional().default([]),
  workingHours: z
    .array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:MM'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:MM'),
        slotDurationMinutes: z.number().min(5).max(180).optional(),
        bufferMinutes: z.number().min(0).max(60).optional(),
      })
    )
    .optional(),
  isAcceptingAppointments: z.boolean().optional().default(true),
});

export const updateDoctorSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  specialty: z.string().optional(),
  specialisation: z.string().optional(),
  consultationFee: z.number().min(0).optional(),
  slotDurationMinutes: z.number().min(5).max(180).optional(),
  bufferMinutes: z.number().min(0).max(60).optional(),
  bio: z.string().optional(),
  qualifications: z.array(z.string()).optional(),
  workingHours: z
    .array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        slotDurationMinutes: z.number().min(5).max(180).optional(),
        bufferMinutes: z.number().min(0).max(60).optional(),
      })
    )
    .optional(),
  isAcceptingAppointments: z.boolean().optional(),
});

/**
 * 1. Admin Creates Doctor (Creates User + DoctorProfile + Enqueues Email Credentials via BullMQ)
 */
export const createDoctor = async (req, res, next) => {
  try {
    const data = req.body;
    const specialtyValue = data.specialty || data.specialisation || 'General Practice';
    const plainPassword = data.password || `Doc${crypto.randomBytes(4).toString('hex')}!2026`;

    // Check if user email already exists
    const existingUser = await User.findOne({ email: data.email.toLowerCase() });
    if (existingUser) {
      return ApiResponse.error(res, 'An account with this email address already exists.', 409);
    }

    // Default working hours if none provided (Monday - Friday 09:00 - 17:00)
    const slotDuration = data.slotDurationMinutes || 30;
    const buffer = typeof data.bufferMinutes === 'number' ? data.bufferMinutes : 0;
    const workingHours = data.workingHours && data.workingHours.length > 0
      ? data.workingHours
      : [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: slotDuration, bufferMinutes: buffer },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', slotDurationMinutes: slotDuration, bufferMinutes: buffer },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', slotDurationMinutes: slotDuration, bufferMinutes: buffer },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', slotDurationMinutes: slotDuration, bufferMinutes: buffer },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', slotDurationMinutes: slotDuration, bufferMinutes: buffer },
        ];

    // 1. Create User with role 'doctor'
    const user = await User.create({
      name: data.name,
      email: data.email.toLowerCase(),
      password: plainPassword,
      role: 'doctor',
      phone: data.phone || '',
      isActive: true,
    });

    // 2. Create DoctorProfile
    const profile = await DoctorProfile.create({
      userId: user._id,
      specialty: specialtyValue,
      consultationFee: data.consultationFee,
      slotDurationMinutes: slotDuration,
      bufferMinutes: buffer,
      workingHours,
      bio: data.bio || '',
      qualifications: data.qualifications || [],
      isAcceptingAppointments: data.isAcceptingAppointments !== undefined ? data.isAcceptingAppointments : true,
    });

    // 3. Dispatch non-blocking BullMQ email job with login credentials
    dispatchEmailJob('send-doctor-credentials', {
      type: 'doctor_credentials',
      payload: {
        to: user.email,
        doctorName: user.name,
        email: user.email,
        temporaryPassword: plainPassword,
        specialty: specialtyValue,
        consultationFee: data.consultationFee,
      },
    });

    logger.info(`Doctor created by admin: Dr. ${user.name} (${user.email}) - Specialty: ${specialtyValue}`);

    return ApiResponse.created(
      res,
      {
        doctor: {
          profileId: profile._id,
          userId: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          specialty: profile.specialty,
          consultationFee: profile.consultationFee,
          slotDurationMinutes: profile.slotDurationMinutes,
          bufferMinutes: profile.bufferMinutes,
          workingHours: profile.workingHours,
          isAcceptingAppointments: profile.isAcceptingAppointments,
          temporaryPassword: plainPassword,
        },
      },
      'Doctor profile created successfully. Login credentials queued for email dispatch.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Admin Lists All Doctors (with specialty and search filters)
 */
export const listAdminDoctors = async (req, res, next) => {
  try {
    const { specialty, specialisation, search, status } = req.query;
    const filterSpecialty = specialty || specialisation;

    const query = {};
    if (filterSpecialty) {
      query.specialty = new RegExp(filterSpecialty, 'i');
    }
    if (status === 'active') {
      query.isAcceptingAppointments = true;
    } else if (status === 'inactive') {
      query.isAcceptingAppointments = false;
    }

    const totalRaw = await DoctorProfile.countDocuments({});
    const totalMatching = await DoctorProfile.countDocuments(query);
    logger.info(
      `[listAdminDoctors] Query: ${JSON.stringify(query)} | Total raw DoctorProfile docs in DB: ${totalRaw} | Matching query docs: ${totalMatching}`
    );

    const profiles = await DoctorProfile.find(query)
      .populate({
        path: 'userId',
        select: 'name email phone avatar isActive createdAt',
        match: search && search.trim() ? { name: new RegExp(search.trim(), 'i') } : {},
      })
      .sort({ createdAt: -1 })
      .lean();

    const doctors = [];
    for (const profile of profiles) {
      let userObj = profile.userId;
      if (!userObj || typeof userObj === 'string' || !userObj.name) {
        const rawUserId = typeof userObj === 'string' ? userObj : profile.userId;
        try {
          if (rawUserId) {
            const userDoc = await User.findById(rawUserId).select('name email phone avatar isActive createdAt').lean();
            if (userDoc) userObj = userDoc;
          }
        } catch (e) {
          logger.error(`[listAdminDoctors] User fallback lookup failed for ID ${rawUserId}: ${e.message}`);
        }
      }

      if (userObj && typeof userObj === 'object' && userObj.name) {
        if (search && search.trim()) {
          const searchRegex = new RegExp(search.trim(), 'i');
          if (!searchRegex.test(userObj.name)) continue;
        }
        profile.userId = userObj;
        doctors.push(profile);
      }
    }

    return ApiResponse.success(
      res,
      { doctors, total: doctors.length },
      'Doctors retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Get Single Doctor by ID (Profile ID or User ID)
 */
export const getAdminDoctorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let profile = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      profile = await DoctorProfile.findOne({
        $or: [{ _id: id }, { userId: id }],
      })
        .populate('userId', 'name email phone avatar isActive createdAt')
        .lean();
    }

    if (!profile) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    return ApiResponse.success(res, { doctor: profile }, 'Doctor retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Admin Updates Doctor Profile & User details
 */
export const updateDoctor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    const profile = await DoctorProfile.findOne({
      $or: [{ _id: id }, { userId: id }],
    });

    if (!profile) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    // Update User fields if provided
    if (data.name || data.phone !== undefined) {
      const userUpdates = {};
      if (data.name) userUpdates.name = data.name;
      if (data.phone !== undefined) userUpdates.phone = data.phone;
      await User.findByIdAndUpdate(profile.userId, { $set: userUpdates });
    }

    // Update DoctorProfile fields
    if (data.specialty || data.specialisation) {
      profile.specialty = data.specialty || data.specialisation;
    }
    if (data.consultationFee !== undefined) profile.consultationFee = data.consultationFee;
    if (data.slotDurationMinutes !== undefined) profile.slotDurationMinutes = data.slotDurationMinutes;
    if (data.bufferMinutes !== undefined) profile.bufferMinutes = data.bufferMinutes;
    if (data.bio !== undefined) profile.bio = data.bio;
    if (data.qualifications !== undefined) profile.qualifications = data.qualifications;
    if (data.workingHours !== undefined) profile.workingHours = data.workingHours;
    if (data.isAcceptingAppointments !== undefined) {
      profile.isAcceptingAppointments = data.isAcceptingAppointments;
    }

    await profile.save();

    const updated = await DoctorProfile.findById(profile._id)
      .populate('userId', 'name email phone avatar isActive')
      .lean();

    return ApiResponse.success(res, { doctor: updated }, 'Doctor profile updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Admin Toggles Doctor Status (Active / Deactivated)
 */
export const toggleDoctorStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    const profile = await DoctorProfile.findOne({
      $or: [{ _id: id }, { userId: id }],
    });

    if (!profile) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    const nextStatus = !profile.isAcceptingAppointments;
    profile.isAcceptingAppointments = nextStatus;
    await profile.save();

    // Also toggle User.isActive
    await User.findByIdAndUpdate(profile.userId, { $set: { isActive: nextStatus } });

    logger.info(`Doctor status changed for Doctor #${profile._id}: isAcceptingAppointments=${nextStatus}`);

    return ApiResponse.success(
      res,
      {
        profileId: profile._id,
        userId: profile.userId,
        isAcceptingAppointments: profile.isAcceptingAppointments,
        isActive: nextStatus,
      },
      `Doctor account ${nextStatus ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Get all users in the system (Admin only)
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
 * 7. Get system statistics and metrics (Admin only)
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
 * 8. Toggle user active status (Admin only)
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

