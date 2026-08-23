import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { User } from '../models/User.js';
import { Leave } from '../models/Leave.js';
import { SlotHoldService } from '../services/slotHoldService.js';
import {
  dispatchEmailJob,
  dispatchLLMSummaryJob,
  dispatchCalendarSyncJob,
} from '../jobs/queue.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export const holdSlotSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  startTime: z.string().datetime('Start time must be a valid ISO-8601 string'),
  endTime: z.string().datetime('End time must be a valid ISO-8601 string'),
});

export const confirmBookingSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  startTime: z.string().datetime('Start time must be a valid ISO-8601 string'),
  endTime: z.string().datetime('End time must be a valid ISO-8601 string'),
  reasonForVisit: z.string().min(3, 'Reason for visit is required'),
  patientNotes: z.string().optional(),
});

export const postVisitSchema = z.object({
  clinicalNotes: z.string().min(1, 'Clinical notes are required'),
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  prescriptions: z
    .array(
      z.object({
        medicationName: z.string(),
        dosage: z.string(),
        frequency: z.string(),
        durationDays: z.number().default(7),
        instructions: z.string().optional(),
      })
    )
    .default([]),
  doctorApproved: z.boolean().default(true),
});

/**
 * 1. Hold Slot (Short-lived Redis Lock)
 */
export const holdSlot = async (req, res, next) => {
  try {
    const { doctorId, startTime, endTime } = req.body;
    const patientId = req.user._id;

    // Check if doctor exists and is accepting appointments
    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId, isAcceptingAppointments: true });
    if (!doctorProfile) {
      return ApiResponse.error(res, 'Doctor not found or currently unavailable for booking.', 404);
    }

    // Check doctor leaves
    const slotDate = new Date(startTime);
    const hasLeave = await Leave.findOne({
      doctorId,
      status: 'approved',
      startDate: { $lte: slotDate },
      endDate: { $gte: slotDate },
    });

    if (hasLeave) {
      return ApiResponse.error(res, 'The doctor is on approved leave during this time slot.', 409);
    }

    // Check database for existing active appointments (held or confirmed)
    const existingActive = await Appointment.findOne({
      doctorId,
      startTime: slotDate,
      status: { $in: ['held', 'confirmed'] },
    });

    if (existingActive) {
      // If held by someone else and not expired
      if (existingActive.status === 'held' && existingActive.slotHoldExpiresAt > new Date()) {
        return ApiResponse.error(res, 'This slot is temporarily held by another patient.', 409);
      }
      if (existingActive.status === 'confirmed') {
        return ApiResponse.error(res, 'This appointment slot is already booked.', 409);
      }
    }

    // Acquire Redis slot hold
    const holdDuration = doctorProfile.slotHoldsDurationSeconds || 300;
    const holdResult = await SlotHoldService.acquireHold(doctorId, startTime, patientId, holdDuration);

    if (!holdResult.success) {
      return ApiResponse.error(res, holdResult.error || 'Slot is currently unavailable.', 409);
    }

    return ApiResponse.success(
      res,
      {
        doctorId,
        startTime,
        endTime,
        holdToken: holdResult.holdToken,
        expiresAt: holdResult.expiresAt,
      },
      'Slot successfully held for 5 minutes'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Confirm & Book Appointment
 * Non-blocking: offloads AI pre-visit summary, Google Calendar sync, and Email to BullMQ
 */
export const confirmAppointment = async (req, res, next) => {
  try {
    const { doctorId, startTime, endTime, reasonForVisit, patientNotes } = req.body;
    const patientId = req.user._id;
    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);

    const doctorUser = await User.findById(doctorId);
    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId });

    if (!doctorUser || !doctorProfile) {
      return ApiResponse.error(res, 'Selected doctor profile does not exist.', 404);
    }

    let appointment;
    try {
      // Create confirmed appointment in MongoDB
      // Protected by the compound unique index { doctorId: 1, startTime: 1 } for { status: ['held', 'confirmed'] }
      appointment = await Appointment.create({
        patientId,
        doctorId,
        startTime: startDateTime,
        endTime: endDateTime,
        status: 'confirmed',
        reasonForVisit,
        patientNotes: patientNotes || '',
        consultationFee: doctorProfile.consultationFee,
        paymentStatus: 'paid', // Dev default
      });
    } catch (dbError) {
      // Catch MongoDB duplicate key error (E11000)
      if (dbError.code === 11000) {
        logger.warn('Slot collision caught via compound unique index E11000:', { doctorId, startTime });
        return ApiResponse.error(
          res,
          'This appointment time slot is already confirmed or reserved. Please select another slot.',
          409
        );
      }
      throw dbError;
    }

    // Release temporary Redis slot hold
    await SlotHoldService.releaseHold(doctorId, startTime);

    // Asynchronously dispatch BullMQ background jobs (NON-BLOCKING)
    // 1. AI Pre-visit Triage Summary
    dispatchLLMSummaryJob('generate-previsit-triage', {
      appointmentId: appointment._id,
      doctorId,
      reasonForVisit,
      patientNotes: patientNotes || '',
    });

    // 2. Google Calendar Synchronization
    dispatchCalendarSyncJob('sync-calendar-event', {
      action: 'create_event',
      appointmentId: appointment._id,
      doctorId,
      eventDetails: {
        title: `VibeHealth Consultation: ${req.user.name} & Dr. ${doctorUser.name}`,
        description: `Reason for visit: ${reasonForVisit}`,
        startTime,
        endTime,
        patientEmail: req.user.email,
        doctorEmail: doctorUser.email,
      },
    });

    // 3. Confirmation Email
    dispatchEmailJob('send-booking-confirmation', {
      type: 'booking_confirmation',
      payload: {
        to: req.user.email,
        patientName: req.user.name,
        doctorName: doctorUser.name,
        startTime,
        appointmentId: appointment._id,
      },
    });

    return ApiResponse.created(
      res,
      {
        appointment,
      },
      'Appointment successfully booked and confirmed'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Get User Appointments (Role & Ownership Filtered)
 */
export const getMyAppointments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'patient') {
      filter.patientId = req.user._id;
    } else if (req.user.role === 'doctor') {
      filter.doctorId = req.user._id;
    }

    const appointments = await Appointment.find(filter)
      .populate('patientId', 'name email phone avatar')
      .populate('doctorId', 'name email')
      .sort({ startTime: -1 })
      .lean();

    return ApiResponse.success(res, { appointments });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Get Appointment by ID (Ownership verified by middleware)
 */
export const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patientId', 'name email phone avatar')
      .populate('doctorId', 'name email')
      .lean();

    if (!appointment) {
      return ApiResponse.error(res, 'Appointment not found', 404);
    }

    // Hide post-visit clinical notes from patients until doctor has reviewed and approved
    if (req.user.role === 'patient' && !appointment.postVisitSummary?.doctorApproved) {
      delete appointment.postVisitSummary;
    }

    return ApiResponse.success(res, { appointment });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Cancel Appointment
 */
export const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = req.appointment; // Attached by requireAppointmentOwnership
    appointment.status = 'cancelled';
    await appointment.save();

    // Release any Redis slot hold if present
    await SlotHoldService.releaseHold(appointment.doctorId, appointment.startTime);

    // If calendar event exists, delete via BullMQ
    if (appointment.calendarEventId) {
      dispatchCalendarSyncJob('cancel-calendar-event', {
        action: 'delete_event',
        appointmentId: appointment._id,
        doctorId: appointment.doctorId,
        eventDetails: { eventId: appointment.calendarEventId },
      });
    }

    return ApiResponse.success(res, { appointment }, 'Appointment cancelled successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Doctor Updates / Approves Post-Visit Clinical Summary
 */
export const updatePostVisitSummary = async (req, res, next) => {
  try {
    const appointment = req.appointment;
    const { clinicalNotes, diagnosis, prescriptions, doctorApproved } = req.body;

    appointment.postVisitSummary = {
      clinicalNotes,
      diagnosis,
      prescriptions,
      doctorApproved: Boolean(doctorApproved),
      doctorApprovedAt: doctorApproved ? new Date() : null,
      patientVisibleAt: doctorApproved ? new Date() : null,
    };

    if (doctorApproved) {
      appointment.status = 'completed';
    }

    await appointment.save();

    return ApiResponse.success(
      res,
      { postVisitSummary: appointment.postVisitSummary },
      'Post-visit clinical summary saved successfully'
    );
  } catch (error) {
    next(error);
  }
};
