import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';
import doctorRoutes from './doctorRoutes.js';
import notificationRoutes from './notificationRoutes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/notifications', notificationRoutes);

export default router;
