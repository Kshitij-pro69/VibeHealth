import { Router } from 'express';
import {
  listDoctors,
  getDoctorSlots,
  updateDoctorProfile,
  requestLeave,
  updateScheduleSchema,
  createLeaveSchema,
} from '../controllers/doctorController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDoctor } from '../middleware/rbac.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

// Public: Browse doctors & view available slots
router.get('/', listDoctors);
router.get('/:id/slots', getDoctorSlots);

// Doctor Only: Update schedule & profile
router.put('/profile', authenticate, requireDoctor, validateRequest(updateScheduleSchema), updateDoctorProfile);
router.post('/leave', authenticate, requireDoctor, validateRequest(createLeaveSchema), requestLeave);

export default router;
