import { z } from 'zod';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Leave } from '../models/Leave.js';
import { Appointment } from '../models/Appointment.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const updateScheduleSchema = z.object({
  specialty: z.string().optional(),
  consultationFee: z.number().min(0).optional(),
  bio: z.string().optional(),
  workingHours: z
    .array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        slotDurationMinutes: z.number().min(10).max(120),
      })
    )
    .optional(),
  isAcceptingAppointments: z.boolean().optional(),
});

export const createLeaveSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().optional(),
});

/**
 * 1. List Public Doctor Profiles
 */
export const listDoctors = async (req, res, next) => {
  try {
    const { specialty, search } = req.query;

    const query = { isAcceptingAppointments: true };
    if (specialty) {
      query.specialty = new RegExp(specialty, 'i');
    }

    const profiles = await DoctorProfile.find(query)
      .populate({
        path: 'userId',
        select: 'name email phone avatar',
        match: search ? { name: new RegExp(search, 'i') } : {},
      })
      .lean();

    // Filter out if user search didn't match
    const validDoctors = profiles.filter((p) => p.userId !== null);

    return ApiResponse.success(res, { doctors: validDoctors });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Get Doctor Details & Available Slots for a given Date
 */
export const getDoctorSlots = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date } = req.query; // YYYY-MM-DD format

    const targetDate = date ? new Date(date) : new Date();
    const dayOfWeek = targetDate.getDay();

    const doctorProfile = await DoctorProfile.findOne({ userId: id }).populate('userId', 'name email avatar');
    if (!doctorProfile) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    // Check if doctor is on leave
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const onLeave = await Leave.findOne({
      doctorId: id,
      status: 'approved',
      startDate: { $lte: endOfDay },
      endDate: { $gte: startOfDay },
    });

    if (onLeave) {
      return ApiResponse.success(res, {
        doctor: doctorProfile,
        date: targetDate.toISOString().split('T')[0],
        onLeave: true,
        slots: [],
      });
    }

    // Find working hours for this day of week
    const dayConfig = doctorProfile.workingHours.find((wh) => wh.dayOfWeek === dayOfWeek);
    if (!dayConfig) {
      return ApiResponse.success(res, {
        doctor: doctorProfile,
        date: targetDate.toISOString().split('T')[0],
        onLeave: false,
        slots: [],
      });
    }

    // Generate potential time slots
    const [startHour, startMinute] = dayConfig.startTime.split(':').map(Number);
    const [endHour, endMinute] = dayConfig.endTime.split(':').map(Number);
    const duration = dayConfig.slotDurationMinutes || 30;

    const slots = [];
    let currentSlotStart = new Date(targetDate);
    currentSlotStart.setHours(startHour, startMinute, 0, 0);

    const shiftEnd = new Date(targetDate);
    shiftEnd.setHours(endHour, endMinute, 0, 0);

    // Fetch existing booked appointments for the day
    const bookedAppointments = await Appointment.find({
      doctorId: id,
      status: { $in: ['held', 'confirmed'] },
      startTime: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const bookedTimes = new Set(bookedAppointments.map((a) => new Date(a.startTime).toISOString()));

    while (currentSlotStart.getTime() + duration * 60000 <= shiftEnd.getTime()) {
      const slotEnd = new Date(currentSlotStart.getTime() + duration * 60000);
      const isBooked = bookedTimes.has(currentSlotStart.toISOString());

      slots.push({
        startTime: currentSlotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        isAvailable: !isBooked,
      });

      currentSlotStart = new Date(currentSlotStart.getTime() + duration * 60000);
    }

    return ApiResponse.success(res, {
      doctor: doctorProfile,
      date: targetDate.toISOString().split('T')[0],
      onLeave: false,
      slots,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Update Doctor Schedule and Profile (Doctor only)
 */
export const updateDoctorProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const updateData = req.body;

    const profile = await DoctorProfile.findOneAndUpdate({ userId }, { $set: updateData }, { new: true, upsert: true });

    return ApiResponse.success(res, { profile }, 'Doctor profile updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Submit Doctor Leave
 */
export const requestLeave = async (req, res, next) => {
  try {
    const { startDate, endDate, reason } = req.body;
    const doctorId = req.user._id;

    const leave = await Leave.create({
      doctorId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      status: 'approved', // Auto-approved or pending for admin
    });

    return ApiResponse.created(res, { leave }, 'Leave recorded successfully');
  } catch (error) {
    next(error);
  }
};
