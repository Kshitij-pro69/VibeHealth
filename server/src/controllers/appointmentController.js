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
  dispatchSlotHoldReleaseJob,
  cancelSlotHoldReleaseJob,
} from '../jobs/queue.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export const holdSlotSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  startTime: z.string().datetime('Start time must be a valid ISO-8601 string'),
  endTime: z.string().datetime('End time must be a valid ISO-8601 string'),
});

export const confirmBookingSchema = z.object({
  appointmentId: z.string().optional(),
  doctorId: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reasonForVisit: z.string().min(3, 'Reason for visit is required'),
  patientNotes: z.string().optional(),
  // Structured symptom intake fields (collected during the hold window)
  symptomDescription: z.string().max(2000).optional(),
  symptomDuration: z.string().max(200).optional(),
  symptomSeverity: z.number().int().min(1).max(10).optional().nullable(),
  existingConditions: z.string().max(1000).optional(),
  currentMedications: z.string().max(1000).optional(),
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
});

export const approvePatientSummarySchema = z.object({
  // The final text shown to the patient — may be AI-generated (edited) or fully manual
  approvedText: z.string().min(1, 'Approved text is required'),
});

/**
 * 1. Hold Slot (Atomic Redis SET NX EX Lock + MongoDB 'held' Document + E11000 Catch)
 */
export const holdSlot = async (req, res, next) => {
  try {
    const { doctorId, startTime, endTime } = req.body;
    const patientId = req.user._id;
    const slotDate = new Date(startTime);
    const slotEndDate = new Date(endTime);

    // 1. Check if doctor exists and is accepting appointments
    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId, isAcceptingAppointments: true });
    if (!doctorProfile) {
      return ApiResponse.error(res, 'Doctor not found or currently unavailable for booking.', 404);
    }

    // 2. Check doctor leaves
    const hasLeave = await Leave.findOne({
      doctorId,
      status: 'approved',
      startDate: { $lte: slotDate },
      endDate: { $gte: slotDate },
    });

    if (hasLeave) {
      return ApiResponse.error(res, 'The doctor is on approved leave during this time slot.', 409);
    }

    // 3. Enforce single-hold patient limit across the platform
    // A patient can hold at most 1 active slot at a time.
    const activePatientHold = await Appointment.findOne({
      patientId,
      status: 'held',
      slotHoldExpiresAt: { $gt: new Date() },
    });

    if (activePatientHold) {
      return ApiResponse.error(
        res,
        'You already have an active appointment slot hold. Please confirm or wait for your active hold to expire.',
        409
      );
    }

    // 4. Check for existing active appointments (held or confirmed) for this doctor and slot
    const existingActive = await Appointment.findOne({
      doctorId,
      startTime: slotDate,
      status: { $in: ['held', 'confirmed'] },
    });

    if (existingActive) {
      if (existingActive.status === 'held' && existingActive.slotHoldExpiresAt > new Date()) {
        return ApiResponse.error(res, 'This slot is being booked by someone else.', 409);
      }
      if (existingActive.status === 'confirmed') {
        return ApiResponse.error(res, 'This appointment slot is already booked.', 409);
      }
    }

    // 5. Acquire Atomic Redis slot hold (SET hold:{doctorId}:{startTimeISO} {patientId} NX EX {ttl})
    const ttlSeconds = parseInt(process.env.SLOT_HOLD_TTL_SECONDS || '600', 10);
    const holdResult = await SlotHoldService.acquireHold(doctorId, startTime, patientId, ttlSeconds);

    if (!holdResult.success) {
      return ApiResponse.error(res, 'This slot is being booked by someone else.', 409);
    }

    // 6. Create Appointment document immediately with status 'held'
    // Enforces database-level conflict prevention via partial compound unique index (unique_active_doctor_slot)
    let appointment;
    try {
      appointment = await Appointment.create({
        patientId,
        doctorId,
        startTime: slotDate,
        endTime: slotEndDate,
        status: 'held',
        slotHoldExpiresAt: holdResult.expiresAt,
        consultationFee: doctorProfile.consultationFee,
      });
    } catch (dbErr) {
      // Catch MongoDB duplicate-key error E11000
      if (dbErr.code === 11000) {
        logger.warn('Slot hold collision caught via MongoDB compound unique index E11000:', { doctorId, startTime });
        // Clean up acquired Redis lock
        await SlotHoldService.releaseHold(doctorId, startTime);
        return ApiResponse.error(res, 'This slot is being booked by someone else.', 409);
      }
      // If DB creation fails for any other reason, release Redis key
      await SlotHoldService.releaseHold(doctorId, startTime);
      throw dbErr;
    }

    // 7. Schedule BullMQ delayed release job to delete held appointment if unconfirmed at TTL expiry
    const delayMs = holdResult.expiresAt.getTime() - Date.now();
    await dispatchSlotHoldReleaseJob(
      {
        appointmentId: appointment._id.toString(),
        doctorId,
        startTimeISO: new Date(startTime).toISOString(),
      },
      delayMs
    );

    return ApiResponse.created(
      res,
      {
        appointmentId: appointment._id,
        doctorId,
        startTime,
        endTime,
        holdToken: holdResult.holdToken,
        expiresAt: holdResult.expiresAt,
      },
      'Slot successfully held'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Confirm Booking (Supports POST /api/appointments/:id/confirm and POST /api/appointments/confirm)
 */
export const confirmAppointment = async (req, res, next) => {
  try {
    const {
      doctorId,
      startTime,
      endTime,
      reasonForVisit,
      patientNotes,
      appointmentId: bodyApptId,
      symptomDescription,
      symptomDuration,
      symptomSeverity,
      existingConditions,
      currentMedications,
    } = req.body;
    const appointmentId = req.params.id || bodyApptId;
    const patientId = req.user._id;

    let appointment;
    if (appointmentId) {
      appointment = await Appointment.findById(appointmentId);
    } else if (doctorId && startTime) {
      appointment = await Appointment.findOne({
        doctorId,
        startTime: new Date(startTime),
        patientId,
        status: 'held',
      });
    }

    if (!appointment) {
      return ApiResponse.error(res, 'Held slot expired or appointment not found.', 404);
    }

    // Verify ownership
    if (appointment.patientId.toString() !== patientId.toString()) {
      return ApiResponse.error(res, 'Unauthorized to confirm this appointment hold.', 403);
    }

    // Verify status
    if (appointment.status === 'confirmed') {
      return ApiResponse.success(res, { appointment }, 'Appointment is already confirmed.');
    }

    if (appointment.status !== 'held') {
      return ApiResponse.error(res, 'Appointment hold is no longer valid.', 409);
    }

    // Verify expiration
    if (appointment.slotHoldExpiresAt && new Date(appointment.slotHoldExpiresAt) < new Date()) {
      await Appointment.findByIdAndDelete(appointment._id);
      await SlotHoldService.releaseHold(appointment.doctorId, appointment.startTime);
      return ApiResponse.error(res, 'Hold period has expired. Please select a slot again.', 409);
    }

    const doctorUser = await User.findById(appointment.doctorId);
    const doctorProfile = await DoctorProfile.findOne({ userId: appointment.doctorId });

    // Flip status to 'confirmed', persist structured intake, and initialise the AI pipeline status
    appointment.status = 'confirmed';
    appointment.reasonForVisit = reasonForVisit;
    appointment.patientNotes = patientNotes || '';
    appointment.symptomDescription = symptomDescription || '';
    appointment.symptomDuration = symptomDuration || '';
    appointment.symptomSeverity = symptomSeverity ?? null;
    appointment.existingConditions = existingConditions || '';
    appointment.currentMedications = currentMedications || '';
    appointment.slotHoldExpiresAt = null;
    appointment.paymentStatus = 'paid';
    // Mark the AI summary pipeline as pending — will be updated to 'completed' or 'failed' by the LLM worker
    appointment.preVisitSummary = { status: 'pending' };
    await appointment.save();

    // Cancel pending BullMQ delayed release job
    await cancelSlotHoldReleaseJob(appointment._id.toString());

    // Release Redis lock key
    await SlotHoldService.releaseHold(appointment.doctorId, appointment.startTime);

    // Asynchronously dispatch BullMQ background jobs (NON-BLOCKING)
    // 1. AI Pre-visit Triage Summary (non-blocking — failure handled by BullMQ worker state machine)
    dispatchLLMSummaryJob('generate-previsit-triage', {
      appointmentId: appointment._id.toString(),
      doctorId: appointment.doctorId.toString(),
      reasonForVisit,
      symptomDescription: symptomDescription || '',
      symptomDuration: symptomDuration || '',
      symptomSeverity: symptomSeverity ?? null,
      existingConditions: existingConditions || '',
      currentMedications: currentMedications || '',
    });

    // 2. Google Calendar Sync Stub
    dispatchCalendarSyncJob('sync-calendar-event', {
      action: 'create_event',
      appointmentId: appointment._id,
      doctorId: appointment.doctorId,
      eventDetails: {
        title: `VibeHealth Consultation: ${req.user.name} & Dr. ${doctorUser?.name || ''}`,
        description: `Reason for visit: ${reasonForVisit}`,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        patientEmail: req.user.email,
        doctorEmail: doctorUser?.email || '',
      },
    });

    // 3. Confirmation Email Stub
    dispatchEmailJob('send-booking-confirmation', {
      type: 'booking_confirmation',
      payload: {
        to: req.user.email,
        patientName: req.user.name,
        doctorName: doctorUser?.name || 'Doctor',
        startTime: appointment.startTime,
        appointmentId: appointment._id,
      },
    });

    return ApiResponse.success(
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
 * 6. Doctor Saves Post-Visit Clinical Notes & Triggers AI Patient Summary Pipeline
 *
 * Saves the doctor's clinical notes, diagnosis, and prescriptions as a DRAFT.
 * This does NOT make anything patient-visible — that requires explicit approval
 * via POST /:id/approve-summary (the human-in-the-loop gate).
 *
 * Side effects (non-blocking):
 *   - Sets postVisitSummary.patientSummaryStatus = 'pending'
 *   - Dispatches BullMQ 'generate-patient-summary' job
 */
export const updatePostVisitSummary = async (req, res, next) => {
  try {
    const appointment = req.appointment;
    const { clinicalNotes, diagnosis, prescriptions } = req.body;

    // Persist clinical data
    appointment.postVisitSummary = {
      ...appointment.postVisitSummary?.toObject?.() ?? {},
      clinicalNotes,
      diagnosis,
      prescriptions: prescriptions || [],
      // Reset patient summary pipeline state to 'pending' — new notes, new summary
      patientSummaryStatus: 'pending',
      patientSummary: {
        generatedText: '',
        approvedText: '',
        medicationSchedule: [],
        followUpSteps: [],
        aiGeneratedAt: null,
      },
      // Retain approval state from before (do not override if already approved)
      doctorApproved: false,
      doctorApprovedAt: null,
      patientVisibleAt: null,
      patientSummaryEmailSentAt: null,
    };

    await appointment.save();

    // Dispatch AI patient-summary generation job (non-blocking)
    dispatchLLMSummaryJob('generate-patient-summary', {
      appointmentId: appointment._id.toString(),
      doctorId: appointment.doctorId.toString(),
      patientId: appointment.patientId.toString(),
      clinicalNotes,
      prescriptions: prescriptions || [],
    });

    return ApiResponse.success(
      res,
      { postVisitSummary: appointment.postVisitSummary },
      'Clinical notes saved. AI patient summary is being generated.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 7. Retry AI Pre-Visit Summary (Doctor-only)
 *
 * Re-enqueues the LLM triage job for an appointment whose summary failed.
 * Sets preVisitSummary.status back to 'pending', then dispatches a fresh BullMQ job.
 * The appointment status (confirmed/completed) is never touched.
 *
 * Accessible by: the doctor assigned to this appointment (requireAppointmentOwnership + requireDoctor)
 */
export const retryAISummary = async (req, res, next) => {
  try {
    const appointment = req.appointment;

    if (!appointment) {
      return ApiResponse.error(res, 'Appointment not found.', 404);
    }

    // Allow retry from either 'failed' or 'completed' state (doctor may want a fresh summary)
    const allowedStatuses = ['failed', 'completed', 'pending'];
    const currentSummaryStatus = appointment.preVisitSummary?.status;
    if (!allowedStatuses.includes(currentSummaryStatus)) {
      return ApiResponse.error(
        res,
        `Cannot retry AI summary from current state: ${currentSummaryStatus}.`,
        409
      );
    }

    // Reset pipeline status to 'pending'
    await Appointment.findByIdAndUpdate(appointment._id, {
      'preVisitSummary.status': 'pending',
      'preVisitSummary.urgency': null,
      'preVisitSummary.chiefComplaint': '',
      'preVisitSummary.suggestedQuestions': [],
      'preVisitSummary.aiGeneratedAt': null,
    });

    // Re-enqueue the LLM job with the existing structured intake data
    await dispatchLLMSummaryJob('retry-previsit-triage', {
      appointmentId: appointment._id.toString(),
      doctorId: appointment.doctorId.toString(),
      reasonForVisit: appointment.reasonForVisit || '',
      symptomDescription: appointment.symptomDescription || '',
      symptomDuration: appointment.symptomDuration || '',
      symptomSeverity: appointment.symptomSeverity ?? null,
      existingConditions: appointment.existingConditions || '',
      currentMedications: appointment.currentMedications || '',
    });

    logger.info(`AI summary retry dispatched for appointment #${appointment._id}`);

    return ApiResponse.success(
      res,
      { summaryStatus: 'pending' },
      'AI summary retry queued. The triage summary will be regenerated shortly.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 8. Doctor Approves & Releases Patient Summary (Human-in-the-Loop Gate)
 *
 * Marks the appointment as 'completed' and sets postVisitSummary.doctorApproved = true.
 * Patient summary text (edited or manual) becomes patient-visible and triggers an email notification.
 */
export const approvePatientSummary = async (req, res, next) => {
  try {
    const appointment = req.appointment;
    const { approvedText } = req.body;

    if (!approvedText || typeof approvedText !== 'string' || !approvedText.trim()) {
      return ApiResponse.error(res, 'Approved text is required to release the summary.', 400);
    }

    const now = new Date();

    appointment.postVisitSummary.patientSummary.approvedText = approvedText.trim();
    appointment.postVisitSummary.doctorApproved = true;
    appointment.postVisitSummary.doctorApprovedAt = now;
    appointment.postVisitSummary.patientVisibleAt = now;
    appointment.status = 'completed';

    await appointment.save();

    // Enqueue email dispatch job to patient (non-blocking)
    const { getQueues } = await import('../jobs/queue.js');
    const { emailQueue } = getQueues();
    await emailQueue.add('send-post-visit-summary', {
      appointmentId: appointment._id.toString(),
      patientId: appointment.patientId.toString(),
      doctorId: appointment.doctorId.toString(),
    });

    logger.info(`Post-visit summary approved for appointment #${appointment._id}`);

    return ApiResponse.success(
      res,
      { postVisitSummary: appointment.postVisitSummary, status: appointment.status },
      'Post-visit summary approved and released to patient.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * 9. Doctor Retries AI Patient Summary Generation
 */
export const retryPatientSummary = async (req, res, next) => {
  try {
    const appointment = req.appointment;

    if (!appointment.postVisitSummary?.clinicalNotes) {
      return ApiResponse.error(res, 'No clinical notes found to generate summary from.', 400);
    }

    // Reset pipeline state
    appointment.postVisitSummary.patientSummaryStatus = 'pending';
    await appointment.save();

    // Re-enqueue job
    await dispatchLLMSummaryJob('generate-patient-summary', {
      appointmentId: appointment._id.toString(),
      doctorId: appointment.doctorId.toString(),
      patientId: appointment.patientId.toString(),
      clinicalNotes: appointment.postVisitSummary.clinicalNotes,
      prescriptions: appointment.postVisitSummary.prescriptions || [],
    });

    logger.info(`Patient summary retry queued for appointment #${appointment._id}`);

    return ApiResponse.success(
      res,
      { patientSummaryStatus: 'pending' },
      'AI patient summary retry queued.'
    );
  } catch (error) {
    next(error);
  }
};

