import { z } from 'zod';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Leave } from '../models/Leave.js';
import { Appointment } from '../models/Appointment.js';
import { Notification } from '../models/Notification.js';
import { SlotHoldService } from '../services/slotHoldService.js';
import { dispatchEmailJob, dispatchCalendarSyncJob } from '../jobs/queue.js';
import { config } from '../config/env.js';
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
  doctorId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
  confirmCancelBookings: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// TIMEZONE UTILITIES
//
// STRATEGY: All dates are stored in UTC in MongoDB. The workingHours fields
// (e.g. startTime: "09:00", endTime: "17:00") represent the CLINIC'S LOCAL
// time — not UTC. The `date` query param is a calendar date in the user's
// local timezone (e.g. "2026-08-24").
//
// To avoid the classic off-by-one-day bug:
//   ❌ WRONG: new Date("2026-08-24")       → midnight UTC → wrong local day
//   ❌ WRONG: .setHours(9, 0, 0, 0)        → sets UTC hours, not local hours
//   ✅ RIGHT: interpret "2026-08-24 09:00" in the clinic TZ → convert to UTC
//
// We use the IANA timezone name (default: "Asia/Kolkata" = IST = UTC+5:30).
// We compute the UTC offset for the given date using Intl.DateTimeFormat, then
// build UTC Date objects from the local HH:MM strings + offset.
// ---------------------------------------------------------------------------

/**
 * Returns the UTC offset in minutes for a given IANA timezone name on a given date.
 * e.g. getUtcOffsetMinutes('Asia/Kolkata') → 330 (IST = UTC+5:30)
 */
function getUtcOffsetMinutes(tz) {
  // Use a reference UTC date to compute local offset
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = now.toLocaleString('en-US', { timeZone: tz });
  const utcDate = new Date(utcStr);
  const localDate = new Date(localStr);
  return (localDate - utcDate) / 60000; // minutes
}

/**
 * Given a local calendar date string "YYYY-MM-DD" and a timezone name,
 * returns a UTC Date object representing midnight of that local date.
 * e.g. localMidnightUTC("2026-08-24", "Asia/Kolkata") → 2026-08-23T18:30:00.000Z
 */
function localMidnightUTC(dateStr, tz) {
  const offsetMinutes = getUtcOffsetMinutes(tz);
  // Parse date components safely (avoid new Date(string) month ambiguity)
  const [year, month, day] = dateStr.split('-').map(Number);
  // Midnight in local time = "YYYY-MM-DDT00:00:00" local
  // → UTC = midnight local - offsetMinutes
  const midnightLocal = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(midnightLocal - offsetMinutes * 60000);
}

/**
 * Given a date string "YYYY-MM-DD" and a time string "HH:MM" in a local tz,
 * returns the corresponding UTC Date object.
 */
function localTimeToUTC(dateStr, timeStr, tz) {
  const offsetMinutes = getUtcOffsetMinutes(tz);
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const localTs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return new Date(localTs - offsetMinutes * 60000);
}

/**
 * Given a UTC Date and a timezone name, returns the local day-of-week (0=Sun, 6=Sat).
 * Uses Intl to determine what day it is in the local timezone.
 */
function getLocalDayOfWeek(utcDate, tz) {
  const localDayName = utcDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(localDayName);
}

// ---------------------------------------------------------------------------

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
 * 2. Get a single doctor's public profile (no slots)
 */
export const getDoctorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const profile = await DoctorProfile.findOne({ userId: id })
      .populate('userId', 'name email phone avatar')
      .lean();

    if (!profile) {
      return ApiResponse.error(res, 'Doctor not found', 404);
    }

    return ApiResponse.success(res, { doctor: profile });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Compute available slots for a doctor on a given date (on-the-fly, never stored).
 *
 * Query params:
 *   date  — YYYY-MM-DD in the clinic's local timezone (default: today)
 *   tz    — IANA timezone name (default: "Asia/Kolkata")
 *
 * Algorithm:
 *   1. Convert date string to local midnight UTC, determine local day-of-week.
 *   2. Look up workingHours config for that day. If none → return [].
 *   3. Convert startTime/endTime HH:MM to UTC Date objects.
 *   4. Check for approved Leave overlapping that UTC day window → return [] if found.
 *   5. Fetch held/confirmed Appointments in that UTC window.
 *   6. Generate candidate slots stepping by (slotDurationMinutes + bufferMinutes).
 *   7. For each candidate, remove if: exact startTime is booked, or slot is in the past.
 *   8. Return remaining slots with ISO startTime/endTime.
 */
export const getAvailability = async (req, res, next) => {
  try {
    // Accept both /slots and /availability param names
    const doctorUserId = req.params.doctorId || req.params.id;
    const tz = req.query.tz || 'Asia/Kolkata';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // "YYYY-MM-DD"
    const dateStr = req.query.date || today;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return ApiResponse.error(res, 'Invalid date format. Use YYYY-MM-DD.', 400);
    }

    // --- Step 1: Resolve timezone boundaries ---
    // localMidnightUTC gives us the UTC instant that corresponds to 00:00:00 local time.
    const dayStartUTC = localMidnightUTC(dateStr, tz);
    const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000 - 1); // 23:59:59.999 local
    const localDayOfWeek = getLocalDayOfWeek(dayStartUTC, tz);

    // --- Step 2: Load doctor profile ---
    const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId })
      .populate('userId', 'name email phone avatar')
      .lean();

    if (!doctorProfile) {
      return ApiResponse.error(res, 'Doctor profile not found', 404);
    }

    // --- Step 3: Find working hours config for this local day ---
    const dayConfig = doctorProfile.workingHours.find((wh) => wh.dayOfWeek === localDayOfWeek);
    if (!dayConfig) {
      return ApiResponse.success(res, {
        doctor: doctorProfile,
        date: dateStr,
        dayOfWeek: localDayOfWeek,
        timezone: tz,
        onLeave: false,
        reason: 'No working hours configured for this day',
        slots: [],
      });
    }

    // --- Step 4: Check for approved leave covering this local calendar day ---
    const leave = await Leave.findOne({
      doctorId: doctorUserId,
      status: 'approved',
      startDate: { $lte: dayEndUTC },
      endDate: { $gte: dayStartUTC },
    }).lean();

    if (leave) {
      return ApiResponse.success(res, {
        doctor: doctorProfile,
        date: dateStr,
        dayOfWeek: localDayOfWeek,
        timezone: tz,
        onLeave: true,
        reason: leave.reason || 'Doctor is on approved leave',
        slots: [],
      });
    }

    // --- Step 5: Convert working hours to UTC Date objects ---
    const shiftStartUTC = localTimeToUTC(dateStr, dayConfig.startTime, tz);
    const shiftEndUTC = localTimeToUTC(dateStr, dayConfig.endTime, tz);
    const duration = dayConfig.slotDurationMinutes ?? doctorProfile.slotDurationMinutes ?? 30;
    const buffer = dayConfig.bufferMinutes ?? doctorProfile.bufferMinutes ?? 0;
    const stepMs = (duration + buffer) * 60000;
    const durationMs = duration * 60000;

    // --- Step 6: Load existing held/confirmed appointments for that UTC window ---
    const bookedAppointments = await Appointment.find({
      doctorId: doctorUserId,
      status: { $in: ['held', 'confirmed'] },
      startTime: { $gte: dayStartUTC, $lte: dayEndUTC },
    }).lean();

    // Build a Set of booked start times (ISO strings) for O(1) lookup
    const bookedStartTimes = new Set(
      bookedAppointments.map((a) => new Date(a.startTime).toISOString())
    );

    // Current wall-clock UTC time — used to prune past slots when querying today
    const nowUTC = new Date();
    const isToday = dateStr === today;

    // --- Step 7: Generate candidate slots and apply filters ---
    const slots = [];
    let cursor = new Date(shiftStartUTC.getTime());

    while (cursor.getTime() + durationMs <= shiftEndUTC.getTime()) {
      const slotStart = new Date(cursor.getTime());
      const slotEnd = new Date(cursor.getTime() + durationMs);

      const isBooked = bookedStartTimes.has(slotStart.toISOString());
      // Prune past slots: if today and slot start has already passed
      const isPast = isToday && slotStart.getTime() <= nowUTC.getTime();

      if (!isBooked && !isPast) {
        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          durationMinutes: duration,
          isAvailable: true,
        });
      }

      cursor = new Date(cursor.getTime() + stepMs);
    }

    return ApiResponse.success(res, {
      doctor: doctorProfile,
      date: dateStr,
      dayOfWeek: localDayOfWeek,
      timezone: tz,
      onLeave: false,
      workingHours: {
        startTime: dayConfig.startTime,
        endTime: dayConfig.endTime,
        slotDurationMinutes: duration,
        bufferMinutes: buffer,
      },
      slots,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Update Doctor Schedule and Profile (Doctor only)
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
 * 5. Preview Leave Conflicts (Checks for existing booked appointments before submitting leave)
 */
export const previewLeaveConflicts = async (req, res, next) => {
  try {
    const { startDate, endDate, doctorId: bodyDocId } = req.body;
    const targetDoctorId = req.user.role === 'admin' && bodyDocId ? bodyDocId : req.user._id;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const conflictingAppointments = await Appointment.find({
      doctorId: targetDoctorId,
      status: { $in: ['held', 'confirmed'] },
      startTime: { $lte: end },
      endTime: { $gte: start },
    })
      .populate('patientId', 'name email phone avatar')
      .sort({ startTime: 1 })
      .lean();

    return ApiResponse.success(res, {
      count: conflictingAppointments.length,
      appointments: conflictingAppointments,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Submit Doctor Leave with Mandatory Conflict Safeguard
 */
export const requestLeave = async (req, res, next) => {
  try {
    const { startDate, endDate, reason, confirmCancelBookings, doctorId: bodyDocId } = req.body;
    const targetDoctorId = req.user.role === 'admin' && bodyDocId ? bodyDocId : req.user._id;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Find all active/confirmed appointments falling in this date range
    const conflictingAppointments = await Appointment.find({
      doctorId: targetDoctorId,
      status: { $in: ['held', 'confirmed'] },
      startTime: { $lte: end },
      endTime: { $gte: start },
    }).populate('patientId', 'name email phone');

    // NEVER silently destroy bookings — if conflicts exist and confirmCancelBookings is false, require confirmation
    if (conflictingAppointments.length > 0 && !confirmCancelBookings) {
      return ApiResponse.error(
        res,
        `You have ${conflictingAppointments.length} appointment(s) on these dates. Marking leave will cancel them and notify the patients. Confirmation required.`,
        409,
        {
          requiresConfirmation: true,
          count: conflictingAppointments.length,
          appointments: conflictingAppointments.map((a) => ({
            _id: a._id,
            patientName: a.patientId?.name,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        }
      );
    }

    // Save the Leave document
    const leave = await Leave.create({
      doctorId: targetDoctorId,
      startDate: start,
      endDate: end,
      reason: reason || '',
      status: 'approved',
    });

    const doctorUser = await User.findById(targetDoctorId);

    // On confirmation (or 0 conflicts): cancel affected appointments & notify patients
    for (const apt of conflictingAppointments) {
      apt.status = 'cancelled';
      apt.cancellationReason = 'doctor_unavailable';
      apt.cancelledAt = new Date();
      apt.slotHoldExpiresAt = null;
      await apt.save();

      // Release any Redis slot lock
      await SlotHoldService.releaseHold(targetDoctorId, apt.startTime);

      // 1. Create in-app Notification for patient
      if (apt.patientId?._id) {
        const aptDateStr = new Date(apt.startTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        await Notification.create({
          userId: apt.patientId._id,
          type: 'appointment_cancelled',
          title: 'Appointment Cancelled - Doctor Unavailable',
          message: `Your appointment on ${aptDateStr} with Dr. ${doctorUser?.name || 'Doctor'} was cancelled because the physician is unavailable. Click to rebook.`,
          metadata: { appointmentId: apt._id, doctorId: targetDoctorId },
        });
      }

      // 2. Dispatch cancellation email via BullMQ
      if (apt.patientId?.email) {
        dispatchEmailJob('send-booking-cancellation', {
          type: 'booking_cancellation',
          payload: {
            to: apt.patientId.email,
            patientName: apt.patientId.name,
            doctorName: doctorUser?.name || 'Doctor',
            startTime: apt.startTime,
            cancellationReason: 'doctor_unavailable',
            rebookUrl: `${config.clientUrl}/patient/doctors/${targetDoctorId}`,
          },
        });
      }

      // 3. Dispatch Google Calendar event deletion via BullMQ
      if (apt.calendarEventId) {
        dispatchCalendarSyncJob('cancel-calendar-event', {
          action: 'delete_event',
          appointmentId: apt._id,
          doctorId: targetDoctorId,
          eventDetails: { eventId: apt.calendarEventId },
        });
      }
    }

    return ApiResponse.created(
      res,
      {
        leave,
        cancelledAppointmentsCount: conflictingAppointments.length,
      },
      `Leave schedule recorded successfully. ${conflictingAppointments.length} appointment(s) cancelled and patients notified.`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 7. Get Doctor Leaves
 */
export const getDoctorLeaves = async (req, res, next) => {
  try {
    const targetDoctorId =
      req.user.role === 'admin' && req.query.doctorId ? req.query.doctorId : req.user._id;

    const leaves = await Leave.find({ doctorId: targetDoctorId }).sort({ startDate: -1 }).lean();

    return ApiResponse.success(res, { leaves });
  } catch (error) {
    next(error);
  }
};

/**
 * 8. Remove/Delete Doctor Leave Record
 * NOTE: Deleting a leave record opens future slot availability but does NOT restore cancelled appointments.
 */
export const deleteLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const leave = await Leave.findById(id);

    if (!leave) {
      return ApiResponse.error(res, 'Leave record not found', 404);
    }

    // Role & Ownership check
    if (req.user.role === 'doctor' && leave.doctorId.toString() !== req.user._id.toString()) {
      return ApiResponse.error(res, 'Unauthorized to delete this leave record', 403);
    }

    await Leave.findByIdAndDelete(id);

    return ApiResponse.success(
      res,
      { id },
      'Leave schedule removed successfully. Note: Previously cancelled appointments remain cancelled.'
    );
  } catch (error) {
    next(error);
  }
};

// Keep getDoctorSlots as an alias for backward compatibility with existing tests
export const getDoctorSlots = getAvailability;
