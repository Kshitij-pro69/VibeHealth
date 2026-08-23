import { Notification } from '../models/Notification.js';
import { Appointment } from '../models/Appointment.js';
import { getQueues } from '../jobs/queue.js';
import { logger } from '../utils/logger.js';

export class NotificationService {
  /**
   * Creates a Notification document in DB first (status: 'pending'),
   * then enqueues the email dispatch job to BullMQ.
   */
  static async createAndDispatchNotification({
    userId,
    recipientEmail,
    type,
    emailType,
    title,
    message,
    metadata = {},
    payload = {},
    delayMs = 0,
  }) {
    try {
      // 1. Create Notification record FIRST (deliveryStatus = 'pending')
      const notification = await Notification.create({
        userId,
        recipientEmail,
        type,
        emailType,
        title,
        message,
        metadata,
        payload,
        deliveryStatus: 'pending',
        attempts: 0,
      });

      // 2. Enqueue BullMQ Job
      const { emailQueue, reminderQueue } = getQueues();
      const targetQueue = delayMs > 0 ? reminderQueue : emailQueue;

      const jobOptions = delayMs > 0 ? { delay: delayMs } : {};

      const job = await targetQueue.add(
        'send-email-notification',
        {
          notificationId: notification._id.toString(),
          recipientEmail,
          emailType,
          payload,
          title,
          message,
        },
        jobOptions
      );

      // 3. Attach BullMQ jobId to Notification document
      notification.jobId = job.id.toString();
      await notification.save();

      logger.info(`Notification #${notification._id} created and queued as BullMQ job #${job.id}`, {
        recipientEmail,
        emailType,
        delayMs,
      });

      return { notification, job };
    } catch (err) {
      logger.error('Error in NotificationService.createAndDispatchNotification:', {
        error: err.message,
        recipientEmail,
        emailType,
      });
      throw err;
    }
  }

  /**
   * Schedules a delayed 24-hour appointment reminder if appointment is > 24 hours in the future.
   */
  static async schedule24hReminder({ appointmentId, userId, recipientEmail, patientName, doctorName, startTime }) {
    try {
      const appointmentStart = new Date(startTime).getTime();
      const reminderTime = appointmentStart - 24 * 60 * 60 * 1000;
      const now = Date.now();
      const delayMs = reminderTime - now;

      // Only schedule if reminder time is in the future (> 1 minute from now)
      if (delayMs > 60 * 1000) {
        const formattedTime = new Date(startTime).toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'short',
        });

        const { notification, job } = await this.createAndDispatchNotification({
          userId,
          recipientEmail,
          type: 'appointment_reminder',
          emailType: 'appointment_reminder',
          title: `Upcoming Consultation Reminder: Dr. ${doctorName}`,
          message: `Reminder: You have a scheduled appointment with Dr. ${doctorName} on ${formattedTime}.`,
          metadata: { appointmentId },
          payload: {
            patientName,
            doctorName,
            startTime,
            appointmentId,
          },
          delayMs,
        });

        // Store reminderJobId on Appointment
        await Appointment.findByIdAndUpdate(appointmentId, {
          reminderJobId: job.id.toString(),
        });

        logger.info(`Scheduled 24h reminder for appointment #${appointmentId} in ${Math.round(delayMs / 1000 / 60)} minutes.`);
        return { notification, job };
      } else {
        logger.info(`Appointment #${appointmentId} is less than 24 hours away; skipping delayed reminder.`);
        return null;
      }
    } catch (err) {
      logger.error(`Failed to schedule 24h reminder for appointment #${appointmentId}:`, { error: err.message });
      return null;
    }
  }

  /**
   * Deterministically cancels a delayed 24h reminder job if appointment is cancelled or rescheduled.
   */
  static async cancel24hReminder(appointmentId) {
    try {
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) return false;

      const jobId = appointment.reminderJobId;

      if (jobId) {
        const { reminderQueue } = getQueues();
        try {
          const job = await reminderQueue.getJob(jobId);
          if (job) {
            await job.remove();
            logger.info(`Removed delayed BullMQ reminder job #${jobId} for appointment #${appointmentId}`);
          }
        } catch (jobErr) {
          logger.warn(`Could not remove BullMQ reminder job #${jobId}: ${jobErr.message}`);
        }
      }

      // Mark matching pending Notification records as 'cancelled'
      const updated = await Notification.updateMany(
        {
          $or: [
            { jobId },
            { 'metadata.appointmentId': appointmentId, type: 'appointment_reminder', deliveryStatus: 'pending' },
          ],
        },
        {
          deliveryStatus: 'cancelled',
          lastError: 'Appointment was cancelled or rescheduled prior to reminder dispatch.',
        }
      );

      logger.info(`Cancelled ${updated.modifiedCount} reminder notification records for appointment #${appointmentId}`);
      return true;
    } catch (err) {
      logger.error(`Error cancelling 24h reminder for appointment #${appointmentId}:`, { error: err.message });
      return false;
    }
  }
}
