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
  const llmWorker = new Worker(
    'llm-summary-queue',
    async (job) => {
      logger.info(`Processing LLM Job: ${job.name} (ID: ${job.id})`);
      const { appointmentId, reasonForVisit, patientNotes, doctorId } = job.data;

      if (job.name === 'generate-previsit-triage') {
        const result = await GeminiService.generatePreVisitSummary(reasonForVisit, patientNotes);

        if (result.success && result.data) {
          // Persist structured pre-visit summary into MongoDB
          await Appointment.findByIdAndUpdate(appointmentId, {
            preVisitSummary: result.data,
          });

          // Dispatch in-app notification to Doctor
          await Notification.create({
            userId: doctorId,
            type: 'pre_visit_ready',
            title: 'New AI Triage Summary Ready',
            message: `A clinical triage assistance summary has been prepared for appointment #${appointmentId}.`,
            metadata: { appointmentId },
          });

          logger.info(`Saved AI pre-visit summary for appointment #${appointmentId}`);
        } else {
          logger.warn(`Skipped AI triage update: ${result.error}`);
        }
      }
    },
    { connection, concurrency: 5 }
  );

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

  workers.forEach((worker) => {
    worker.on('failed', (job, err) => {
      logger.error(`Worker [${worker.name}] job failed (ID: ${job?.id}):`, { error: err.message });
    });

    worker.on('error', (err) => {
      logger.error(`Worker [${worker.name}] internal error:`, { error: err.message });
    });
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
