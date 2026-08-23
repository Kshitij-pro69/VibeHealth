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
