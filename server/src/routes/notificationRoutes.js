import { Router } from 'express';
import { Notification } from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

router.use(authenticate);

// Get current user notifications
router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return ApiResponse.success(res, { notifications });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return ApiResponse.error(res, 'Notification not found', 404);
    }

    return ApiResponse.success(res, { notification });
  } catch (error) {
    next(error);
  }
});

export default router;
