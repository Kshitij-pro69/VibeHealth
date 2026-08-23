import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';
import doctorRoutes from './doctorRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import adminRoutes from './adminRoutes.js';

const router = Router();

router.use('/health', healthRoutes);
router.get('/cors-check', (req, res) => res.json({ ok: true }));
router.use('/auth', authRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

export default router;

