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
      }
    },
    { connection, concurrency: 5 }
  );

  // Final-attempt failure safety net:
  // If all 3 retries are exhausted and the job-level handler hasn't already
  // set status='failed' (e.g. it threw before the DB write), this listener
  // ensures we still flip the status flag. Uses attemptsMade check to only
  // fire on the truly final attempt.
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
        // Only update if still stuck in 'pending' (avoid clobbering a 'completed' race)
        await Appointment.findOneAndUpdate(
          { _id: appointmentId, 'preVisitSummary.status': 'pending' },
          { 'preVisitSummary.status': 'failed' }
        );
      } catch (dbErr) {
        logger.error('Failed to mark preVisitSummary.status=failed after final retry:', {
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

  // 2. Email Notification Worker
  const emailWorker = new Worker(
    'email-queue',
    async (job) => {
      logger.info(`Processing Email Job: ${job.name} (ID: ${job.id})`);
      const { type, payload } = job.data;

      if (type === 'booking_confirmation') {
        await EmailService.sendBookingConfirmation(payload);
      } else if (type === 'doctor_credentials') {
        await EmailService.sendDoctorCredentials(payload);
      } else if (type === 'booking_cancellation') {
        await EmailService.sendBookingCancellation(payload);
      } else {
        await EmailService.sendEmail(payload);
      }
    },
    { connection, concurrency: 10 }
  );

  // 3. Google Calendar Sync Worker
  const calendarWorker = new Worker(
    'calendar-sync-queue',
    async (job) => {
      logger.info(`Processing Calendar Job: ${job.name} (ID: ${job.id})`);
      const { action, appointmentId, doctorId, eventDetails } = job.data;

      const profile = await DoctorProfile.findOne({ userId: doctorId }).select('+googleOAuthTokens');
      const tokens = profile?.googleOAuthTokens;

      if (!tokens || !tokens.accessToken) {
        logger.info(`Doctor ${doctorId} has no active Google Calendar integration.`);
        return;
      }

      if (action === 'create_event') {
        const res = await CalendarService.createEvent(tokens, eventDetails);
        if (res.success && res.eventId) {
          await Appointment.findByIdAndUpdate(appointmentId, {
            calendarEventId: res.eventId,
          });
        }
      } else if (action === 'delete_event' && eventDetails?.eventId) {
        await CalendarService.deleteEvent(tokens, eventDetails.eventId);
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

  const workers = [llmWorker, emailWorker, calendarWorker, slotHoldWorker];

  // llmWorker already has a dedicated 'failed' listener registered above.
  // Register generic error/failed logging for the remaining workers.
  const nonLLMWorkers = [emailWorker, calendarWorker, slotHoldWorker];
  nonLLMWorkers.forEach((worker) => {
    worker.on('failed', (job, err) => {
      logger.error(`Worker [${worker.name}] job failed (ID: ${job?.id}):`, { error: err.message });
    });

    worker.on('error', (err) => {
      logger.error(`Worker [${worker.name}] internal error:`, { error: err.message });
    });
  });

  // Register generic error listener on llmWorker (failed is already handled above)
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
