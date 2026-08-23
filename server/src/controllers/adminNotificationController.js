import { Notification } from '../models/Notification.js';
import { getQueues } from '../jobs/queue.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

/**
 * Admin: Get Notification Audit Logs (with status counts & filters)
 */
export const getNotificationLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { deliveryStatus, emailType, search } = req.query;

    const query = {};

    if (deliveryStatus && deliveryStatus !== 'all') {
      query.deliveryStatus = deliveryStatus;
    }

    if (emailType && emailType !== 'all') {
      query.emailType = emailType;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ recipientEmail: searchRegex }, { title: searchRegex }, { message: searchRegex }];
    }

    const skip = (page - 1) * limit;

    const [notifications, total, statusCounts] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.aggregate([
        { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = {
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    };

    statusCounts.forEach((c) => {
      if (c._id && counts[c._id] !== undefined) {
        counts[c._id] = c.count;
      }
      counts.total += c.count;
    });

    return ApiResponse.success(res, {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
      counts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Manual Retry of Failed Notification
 */
export const retryFailedNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return ApiResponse.error(res, 'Notification record not found.', 404);
    }

    // Reset status & attempts
    notification.deliveryStatus = 'pending';
    notification.attempts = 0;
    notification.lastError = null;

    // Enqueue fresh BullMQ job
    const { emailQueue } = getQueues();
    const job = await emailQueue.add(
      'send-email-notification',
      {
        notificationId: notification._id.toString(),
        recipientEmail: notification.recipientEmail,
        emailType: notification.emailType,
        payload: notification.payload || {},
        title: notification.title,
        message: notification.message,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );

    notification.jobId = job.id.toString();
    await notification.save();

    logger.info(`Admin re-queued notification #${notification._id} as BullMQ job #${job.id}`);

    return ApiResponse.success(
      res,
      { notification },
      'Notification re-queued for delivery retry.'
    );
  } catch (error) {
    next(error);
  }
};
