import { Router } from 'express';
import {
  listDoctors,
  getDoctorById,
  getAvailability,
  getDoctorSlots,   // alias for getAvailability — backward compat
  updateDoctorProfile,
  requestLeave,
  updateScheduleSchema,
  createLeaveSchema,
} from '../controllers/doctorController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDoctor } from '../middleware/rbac.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

// Public: Browse doctors
router.get('/', listDoctors);

// Public: Get a single doctor's profile (no slots)
router.get('/:id/profile', getDoctorById);

// Public: Compute available slots on the fly
// Both paths point to the same handler for backward compatibility
router.get('/:id/slots', getDoctorSlots);
router.get('/:doctorId/availability', getAvailability);

// Doctor Only: Update schedule & profile
router.put('/profile', authenticate, requireDoctor, validateRequest(updateScheduleSchema), updateDoctorProfile);
router.post('/leave', authenticate, requireDoctor, validateRequest(createLeaveSchema), requestLeave);

export default router;
