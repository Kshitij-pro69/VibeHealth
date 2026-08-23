import { Router } from 'express';
import {
  getAllUsers,
  getAdminStats,
  toggleUserStatus,
  createDoctor,
  listAdminDoctors,
  getAdminDoctorById,
  updateDoctor,
  toggleDoctorStatus,
  createDoctorSchema,
  updateDoctorSchema,
} from '../controllers/adminController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

// Guard all admin routes with requireAuth and requireRole('admin')
router.use(requireAuth);
router.use(requireRole('admin'));

// System stats & User Management
router.get('/users', getAllUsers);
router.get('/stats', getAdminStats);
router.put('/users/:id/toggle-status', toggleUserStatus);

// Doctor Profile Management
router.post('/doctors', validateRequest(createDoctorSchema), createDoctor);
router.get('/doctors', listAdminDoctors);
router.get('/doctors/:id', getAdminDoctorById);
router.put('/doctors/:id', validateRequest(updateDoctorSchema), updateDoctor);
router.put('/doctors/:id/toggle-status', toggleDoctorStatus);

export default router;

