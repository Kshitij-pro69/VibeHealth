import { Worker } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import { GeminiService } from '../services/geminiService.js';
import { CalendarService } from '../services/calendarService.js';
import { EmailService } from '../services/emailService.js';
import { SlotHoldService } from '../services/slotHoldService.js';
import { Appointment } from '../models/Appointment.js';
import { Notification } from '../models/Notification.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { logger } from '../utils/logger.js';

let activeWorkers = [];

export const startWorkers = () => {
  const connection = getRedisClient();

  // 1. LLM Pre-Visit Triage Summary Worker
  //    Retries: 3x with exponential backoff (2s → 4s → 8s) per queue default job options.
  //    State machine:
  //      confirmation → preVisitSummary.status = 'pending'  (set by confirmAppointment controller)
  //      job success  → preVisitSummary.status = 'completed' (set here)
  //      job failure  → preVisitSummary.status = 'failed'   (set here — NEVER alters appointment.status)
  const llmWorker = new Worker(
    'llm-summary-queue',
    async (job) => {
      logger.info(`Processing LLM Job: ${job.name} (ID: ${job.id})`);
      const {
        appointmentId,
        reasonForVisit,
        symptomDescription,
        symptomDuration,
        symptomSeverity,
        existingConditions,
        currentMedications,
        doctorId,
      } = job.data;

      if (job.name === 'generate-previsit-triage' || job.name === 'retry-previsit-triage') {
        // Assemble the raw symptom text for fallback display (preserved verbatim)
        const rawSymptomText = [
          reasonForVisit && `Reason for visit: ${reasonForVisit}`,
          symptomDescription && `Symptoms: ${symptomDescription}`,
          symptomDuration && `Duration: ${symptomDuration}`,
          symptomSeverity != null && `Severity: ${symptomSeverity}/10`,
          existingConditions && `Existing conditions: ${existingConditions}`,
          currentMedications && `Current medications: ${currentMedications}`,
        ]
          .filter(Boolean)
          .join('\n');

        const result = await GeminiService.generatePreVisitSummary({
          reasonForVisit,
          symptomDescription,
          symptomDuration,
          symptomSeverity,
          existingConditions,
          currentMedications,
        });

        if (result.success && result.data) {
          // ✅ COMPLETED — persist AI output and mark pipeline complete
          await Appointment.findByIdAndUpdate(appointmentId, {
            'preVisitSummary.status': 'completed',
            'preVisitSummary.urgency': result.data.urgency,
            'preVisitSummary.chiefComplaint': result.data.chiefComplaint,
            'preVisitSummary.suggestedQuestions': result.data.suggestedQuestions,
            'preVisitSummary.aiGeneratedAt': result.data.aiGeneratedAt,
            'preVisitSummary.disclaimer': result.data.disclaimer,
            'preVisitSummary.rawSymptomText': rawSymptomText,
          });

          // Notify doctor
          await Notification.create({
            userId: doctorId,
            type: 'pre_visit_ready',
            title: 'AI Triage Summary Ready',
            message: `Urgency: ${result.data.urgency} — ${result.data.chiefComplaint}`,
            metadata: { appointmentId },
          });

          logger.info(`✅ AI pre-visit summary completed for appointment #${appointmentId}`);
        } else {
          // ❌ FAILED — mark pipeline failed, preserve raw text for doctor fallback display.
          // CRITICAL: appointment.status is NOT touched — the booking remains valid.
          logger.warn(
            `LLM summary failed for appointment #${appointmentId}: ${result.error}. Marking status=failed.`
          );
          await Appointment.findByIdAndUpdate(appointmentId, {
            'preVisitSummary.status': 'failed',
            'preVisitSummary.rawSymptomText': rawSymptomText,
          });
          // Throw so BullMQ records this attempt as failed and can retry
          throw new Error(result.error || 'LLM summary generation failed');
        }
      } else if (
        job.name === 'generate-patient-summary' ||
        job.name === 'retry-patient-summary'
      ) {
        const { appointmentId, clinicalNotes, prescriptions = [] } = job.data;

        const result = await GeminiService.generatePatientSummary(clinicalNotes, prescriptions);

        if (result.success && result.data) {
          // ✅ COMPLETED — persist draft summary for doctor review
          await Appointment.findByIdAndUpdate(appointmentId, {
            'postVisitSummary.patientSummaryStatus': 'completed',
            'postVisitSummary.patientSummary.generatedText': result.data.summary,
            'postVisitSummary.patientSummary.medicationSchedule': result.data.medicationSchedule,
            'postVisitSummary.patientSummary.followUpSteps': result.data.followUpSteps,
            'postVisitSummary.patientSummary.aiGeneratedAt': result.data.aiGeneratedAt,
          });

          logger.info(`✅ AI patient summary completed (draft) for appointment #${appointmentId}`);
        } else {
          // ❌ FAILED — mark patientSummaryStatus=failed. Doctor can write manually or retry.
          logger.warn(
            `AI patient summary failed for appointment #${appointmentId}: ${result.error}. Marking patientSummaryStatus=failed.`
          );
          await Appointment.findByIdAndUpdate(appointmentId, {
            'postVisitSummary.patientSummaryStatus': 'failed',
          });
          throw new Error(result.error || 'AI patient summary generation failed');
        }
      }
    },
    { connection, concurrency: 5 }
  );

  // Final-attempt failure safety net:
  llmWorker.on('failed', async (job, err) => {
    if (!job) return;
    const { appointmentId } = job.data ?? {};
    if (!appointmentId) return;

    const maxAttempts = job.opts?.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      logger.error(
        `LLM Worker: all ${maxAttempts} retries exhausted for appointment #${appointmentId}. Ensuring status=failed.`,
        { error: err.message }
      );
      try {
        if (job.name === 'generate-previsit-triage' || job.name === 'retry-previsit-triage') {
          await Appointment.findOneAndUpdate(
            { _id: appointmentId, 'preVisitSummary.status': 'pending' },
            { 'preVisitSummary.status': 'failed' }
          );
        } else if (
          job.name === 'generate-patient-summary' ||
          job.name === 'retry-patient-summary'
        ) {
          await Appointment.findOneAndUpdate(
            { _id: appointmentId, 'postVisitSummary.patientSummaryStatus': 'pending' },
            { 'postVisitSummary.patientSummaryStatus': 'failed' }
          );
        }
      } catch (dbErr) {
        logger.error('Failed to mark summary status=failed after final retry:', {
          error: dbErr.message,
        });
      }
    } else {
      logger.warn(
        `LLM Worker: job failed (attempt ${job.attemptsMade}/${maxAttempts}), retrying...`,
        { error: err.message }
      );
    }
  });


  // 2. Email & Reminder Notification Workers
  const processNotificationJob = async (job) => {
    logger.info(`Processing Email Notification Job: ${job.name} (ID: ${job.id})`);
    const { notificationId, recipientEmail, emailType, payload = {}, title, message, type } = job.data;

    let notification = null;
    if (notificationId) {
      notification = await Notification.findById(notificationId);
    } else if (job.id) {
      notification = await Notification.findOne({ jobId: job.id.toString() });
    }

    if (notification) {
      notification.attempts = (notification.attempts || 0) + 1;
      await notification.save();
    }

    let emailResult = { success: false, error: 'Unknown email template type' };

    const effectiveType = emailType || type;
    const targetEmail = recipientEmail || payload.to || payload.recipientEmail;

    if (effectiveType === 'booking_confirmation') {
      emailResult = await EmailService.sendBookingConfirmation({
        to: targetEmail,
        patientName: payload.patientName,
        doctorName: payload.doctorName,
        startTime: payload.startTime,
        appointmentId: payload.appointmentId,
        isDoctorCopy: payload.isDoctorCopy,
      });
    } else if (effectiveType === 'appointment_reminder') {
      emailResult = await EmailService.send24hReminder({
        to: targetEmail,
        patientName: payload.patientName,
        doctorName: payload.doctorName,
        startTime: payload.startTime,
        appointmentId: payload.appointmentId,
      });
    } else if (effectiveType === 'cancellation') {
      emailResult = await EmailService.sendCancellationNotice({
        to: targetEmail,
        recipientName: payload.recipientName,
        otherPartyName: payload.otherPartyName,
        startTime: payload.startTime,
        cancelledBy: payload.cancelledBy,
      });
    } else if (effectiveType === 'doctor_leave_cancellation') {
      emailResult = await EmailService.sendBookingCancellation({
        to: targetEmail,
        patientName: payload.patientName,
        doctorName: payload.doctorName,
        startTime: payload.startTime,
        cancellationReason: payload.cancellationReason || 'doctor_unavailable',
        rebookUrl: payload.rebookUrl,
      });
    } else if (effectiveType === 'rebooking_prompt') {
      emailResult = await EmailService.sendRebookingPrompt({
        to: targetEmail,
        patientName: payload.patientName,
        doctorName: payload.doctorName,
        rebookUrl: payload.rebookUrl,
      });
    } else if (effectiveType === 'post_visit_summary' || job.name === 'send-post-visit-summary') {
      let approvedSummary = payload.approvedSummary;
      let patientName = payload.patientName;
      let doctorName = payload.doctorName;

      if (!approvedSummary && payload.appointmentId) {
        const apt = await Appointment.findById(payload.appointmentId)
          .populate('patientId', 'name email')
          .populate('doctorId', 'name');
        if (apt) {
          approvedSummary = apt.postVisitSummary?.patientSummary?.approvedText || apt.postVisitSummary?.clinicalNotes;
          patientName = apt.patientId?.name;
          doctorName = apt.doctorId?.name;
        }
      }

      emailResult = await EmailService.sendPostVisitSummary({
        to: targetEmail,
        patientName: patientName || 'Patient',
        doctorName: doctorName || 'Physician',
        approvedSummary: approvedSummary || 'Visit summary completed.',
      });
    } else if (effectiveType === 'doctor_credentials') {
      emailResult = await EmailService.sendDoctorCredentials(payload);
    } else if (effectiveType === 'medication_reminder') {
      emailResult = await EmailService.sendMedicationReminder({
        to: targetEmail,
        patientName: payload.patientName,
        medicationName: payload.medicationName,
        dosage: payload.dosage,
        schedule: payload.schedule,
      });
    } else {
      emailResult = await EmailService.sendEmail({
        to: targetEmail,
        subject: title || payload.subject || 'VibeHealth Notification',
        text: message || payload.text || '',
        html: payload.html || undefined,
      });
    }

    if (emailResult.success) {
      if (notification) {
        notification.deliveryStatus = 'sent';
        notification.sentAt = new Date();
        notification.lastError = null;
        await notification.save();
      }
      logger.info(`✅ Email notification job #${job.id} delivered to ${targetEmail}`);
      return emailResult;
    } else {
      if (notification) {
        notification.lastError = emailResult.error;
        await notification.save();
      }
      logger.warn(`❌ Email notification job #${job.id} failed (attempt ${job.attemptsMade}): ${emailResult.error}`);
      throw new Error(emailResult.error || 'Email dispatch failed');
    }
  };

  const emailWorker = new Worker('email-queue', processNotificationJob, { connection, concurrency: 10 });
  const reminderWorker = new Worker('reminder-queue', processNotificationJob, { connection, concurrency: 10 });

  // 3. Google Calendar Sync Worker (Resilient & Non-Blocking)
  const calendarWorker = new Worker(
    'calendar-sync-queue',
    async (job) => {
      logger.info(`Processing Calendar Job: ${job.name} (ID: ${job.id})`);
      const { action, appointmentId, doctorId, patientId: jobPatientId, eventDetails = {} } = job.data;

      const appointment = await Appointment.findById(appointmentId);
      if (!appointment && action !== 'create_event') return;

      const targetPatientId = jobPatientId || appointment?.patientId?.toString();
      const targetDoctorId = doctorId || appointment?.doctorId?.toString();

      if (action === 'create_event' || action === 'sync-calendar-event') {
        const updateFields = {};

        // 1. Create Patient Calendar Event (if patient has connected calendar)
        if (targetPatientId) {
          const resP = await CalendarService.createEvent(targetPatientId, eventDetails);
          if (resP.success && resP.eventId) {
            updateFields.patientCalendarEventId = resP.eventId;
          }
        }

        // 2. Create Doctor Calendar Event (if doctor has connected calendar)
        if (targetDoctorId) {
          const resD = await CalendarService.createEvent(targetDoctorId, eventDetails);
          if (resD.success && resD.eventId) {
            updateFields.doctorCalendarEventId = resD.eventId;
            updateFields.calendarEventId = resD.eventId;
          }
        }

        if (Object.keys(updateFields).length > 0 && appointmentId) {
          await Appointment.findByIdAndUpdate(appointmentId, updateFields);
        }
      } else if (action === 'update_event' || action === 'update-calendar-event') {
        // Reschedule: update existing events on both calendars
        const pEventId = appointment?.patientCalendarEventId;
        const dEventId = appointment?.doctorCalendarEventId || appointment?.calendarEventId;

        if (targetPatientId && pEventId) {
          await CalendarService.updateEvent(targetPatientId, pEventId, eventDetails);
        }
        if (targetDoctorId && dEventId) {
          await CalendarService.updateEvent(targetDoctorId, dEventId, eventDetails);
        }
      } else if (action === 'delete_event' || action === 'cancel-calendar-event') {
        // Cancellation: delete events from both calendars
        const pEventId = appointment?.patientCalendarEventId || eventDetails?.patientEventId;
        const dEventId = appointment?.doctorCalendarEventId || appointment?.calendarEventId || eventDetails?.eventId;

        if (targetPatientId && pEventId) {
          await CalendarService.deleteEvent(targetPatientId, pEventId);
        }
        if (targetDoctorId && dEventId) {
          await CalendarService.deleteEvent(targetDoctorId, dEventId);
        }
      }
    },
    { connection, concurrency: 5 }
  );

  // 4. Delayed Slot Hold Auto-Release Worker
  const slotHoldWorker = new Worker(
    'slot-hold-queue',
    async (job) => {
      logger.info(`Processing Slot Hold Release Job: ${job.name} (ID: ${job.id})`);
      const { appointmentId, doctorId, startTimeISO } = job.data;

      const appointment = await Appointment.findById(appointmentId);
      if (appointment && appointment.status === 'held') {
        // Delete held appointment document if it remains unconfirmed at TTL expiry
        await Appointment.findByIdAndDelete(appointmentId);
        logger.info(`Deleted expired held appointment document #${appointmentId}`);
      }

      // Ensure Redis lock key is deleted
      await SlotHoldService.releaseHold(doctorId, startTimeISO || appointment?.startTime);
    },
    { connection, concurrency: 5 }
  );

  // Register final-attempt failure listener for email & reminder workers
  [emailWorker, reminderWorker].forEach((worker) => {
    worker.on('failed', async (job, err) => {
      if (!job) return;
      const { notificationId } = job.data ?? {};
      const maxAttempts = job.opts?.attempts ?? 3;

      if (job.attemptsMade >= maxAttempts) {
        logger.error(`Worker [${worker.name}] all ${maxAttempts} retries exhausted for job #${job.id}. Ensuring status=failed.`, {
          error: err.message,
        });

        try {
          if (notificationId) {
            await Notification.findByIdAndUpdate(notificationId, {
              deliveryStatus: 'failed',
              lastError: err.message,
            });
          } else if (job.id) {
            await Notification.findOneAndUpdate(
              { jobId: job.id.toString() },
              { deliveryStatus: 'failed', lastError: err.message }
            );
          }
        } catch (dbErr) {
          logger.error(`Failed to mark Notification status=failed: ${dbErr.message}`);
        }
      }
    });
  });

  const workers = [llmWorker, emailWorker, reminderWorker, calendarWorker, slotHoldWorker];

  // Register generic error logging for workers
  const nonLLMWorkers = [emailWorker, reminderWorker, calendarWorker, slotHoldWorker];
  nonLLMWorkers.forEach((worker) => {
    worker.on('error', (err) => {
      logger.error(`Worker [${worker.name}] internal error:`, { error: err.message });
    });
  });

  // Register generic error listener on llmWorker
  llmWorker.on('error', (err) => {
    logger.error(`Worker [${llmWorker.name}] internal error:`, { error: err.message });
  });

  activeWorkers = workers;
  logger.info('In-process BullMQ workers started successfully (Free-tier single-process mode)');
};

export const stopWorkers = async () => {
  logger.info('Stopping BullMQ workers gracefully...');
  for (const worker of activeWorkers) {
    await worker.close();
  }
  activeWorkers = [];
  logger.info('All BullMQ workers stopped.');
};
