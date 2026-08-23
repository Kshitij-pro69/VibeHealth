import { Router } from 'express';
import {
  listDoctors,
  getDoctorById,
  getAvailability,
  getDoctorSlots,
  updateDoctorProfile,
  previewLeaveConflicts,
  requestLeave,
  getDoctorLeaves,
  deleteLeave,
  updateScheduleSchema,
  createLeaveSchema,
} from '../controllers/doctorController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDoctor, requireDoctorOrAdmin } from '../middleware/rbac.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

// Public: Browse doctors
router.get('/', listDoctors);

// Public: Get a single doctor's profile (no slots)
router.get('/:id/profile', getDoctorById);

// Public: Compute available slots on the fly
router.get('/:id/slots', getDoctorSlots);
router.get('/:doctorId/availability', getAvailability);

// Doctor & Admin: Profile updates and Leave schedule management
router.put('/profile', authenticate, requireDoctor, validateRequest(updateScheduleSchema), updateDoctorProfile);

// Leave management endpoints
router.get('/leave', authenticate, requireDoctorOrAdmin, getDoctorLeaves);
router.post('/leave/preview', authenticate, requireDoctorOrAdmin, previewLeaveConflicts);
router.post('/leave', authenticate, requireDoctorOrAdmin, validateRequest(createLeaveSchema), requestLeave);
router.delete('/leave/:id', authenticate, requireDoctorOrAdmin, deleteLeave);

export default router;
