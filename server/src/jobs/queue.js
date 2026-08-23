import { Queue } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s -> 4s -> 8s
  },
  removeOnComplete: {
    age: 3600 * 24, // Keep completed jobs for 24h
    count: 500,
  },
  removeOnFail: {
    age: 3600 * 24 * 7, // Keep failed jobs for 7 days
    count: 1000,
  },
};

let queues = null;

export const getQueues = () => {
  if (!queues) {
    const connection = getRedisClient();

    queues = {
      emailQueue: new Queue('email-queue', { connection, defaultJobOptions }),
      llmSummaryQueue: new Queue('llm-summary-queue', { connection, defaultJobOptions }),
      calendarSyncQueue: new Queue('calendar-sync-queue', { connection, defaultJobOptions }),
      reminderQueue: new Queue('reminder-queue', { connection, defaultJobOptions }),
      slotHoldQueue: new Queue('slot-hold-queue', { connection, defaultJobOptions }),
    };

    logger.info('BullMQ Queues initialized with exponential backoff retry');
  }

  return queues;
};

/**
 * Dispatch helper functions for non-blocking operations
 */
export const dispatchEmailJob = async (jobName, data) => {
  try {
    const { emailQueue } = getQueues();
    return await emailQueue.add(jobName, data);
  } catch (err) {
    logger.error(`Failed to dispatch email job [${jobName}]:`, { error: err.message });
  }
};

export const dispatchLLMSummaryJob = async (jobName, data) => {
  try {
    const { llmSummaryQueue } = getQueues();
    return await llmSummaryQueue.add(jobName, data);
  } catch (err) {
    logger.error(`Failed to dispatch LLM job [${jobName}]:`, { error: err.message });
  }
};

export const dispatchCalendarSyncJob = async (jobName, data) => {
  try {
    const { calendarSyncQueue } = getQueues();
    return await calendarSyncQueue.add(jobName, data);
  } catch (err) {
    logger.error(`Failed to dispatch Calendar job [${jobName}]:`, { error: err.message });
  }
};

/**
 * Schedule a delayed BullMQ job to auto-release an unconfirmed slot hold upon TTL expiration.
 */
export const dispatchSlotHoldReleaseJob = async (data, delayMs) => {
  try {
    const { slotHoldQueue } = getQueues();
    const jobId = `release_hold_${data.appointmentId}`;
    logger.info(`Scheduling BullMQ delayed slot hold release job [${jobId}] with delay ${delayMs}ms`);
    return await slotHoldQueue.add('release-expired-hold', data, {
      delay: delayMs,
      jobId,
    });
  } catch (err) {
    logger.error(`Failed to dispatch slot hold release job:`, { error: err.message });
  }
};

/**
 * Cancel/remove a pending BullMQ delayed slot hold release job when confirmed early.
 */
export const cancelSlotHoldReleaseJob = async (appointmentId) => {
  try {
    const { slotHoldQueue } = getQueues();
    const jobId = `release_hold_${appointmentId}`;
    const job = await slotHoldQueue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info(`Cancelled BullMQ delayed slot hold release job [${jobId}] (Appointment confirmed early)`);
      return true;
    }
  } catch (err) {
    logger.warn(`Could not cancel delayed slot hold release job for ${appointmentId}:`, { error: err.message });
  }
  return false;
};
