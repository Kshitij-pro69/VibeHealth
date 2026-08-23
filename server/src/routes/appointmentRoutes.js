import { Router } from 'express';
import {
  holdSlot,
  confirmAppointment,
  getMyAppointments,
  getAppointmentById,
  cancelAppointment,
  updatePostVisitSummary,
  holdSlotSchema,
  confirmBookingSchema,
  postVisitSchema,
} from '../controllers/appointmentController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDoctor } from '../middleware/rbac.js';
import { requireAppointmentOwnership } from '../middleware/ownership.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

// Protected: All appointment operations require authentication
router.use(authenticate);

// 1. Slot Hold
router.post('/hold', validateRequest(holdSlotSchema), holdSlot);

// 2. Confirm Booking
router.post('/confirm', validateRequest(confirmBookingSchema), confirmAppointment);

// 3. User Appointments list
router.get('/my', getMyAppointments);

// 4. View single appointment
router.get('/:id', requireAppointmentOwnership, getAppointmentById);

// 5. Cancel appointment
router.put('/:id/cancel', requireAppointmentOwnership, cancelAppointment);

// 6. Doctor post-visit notes update & approval
router.put(
  '/:id/post-visit',
  requireDoctor,
  requireAppointmentOwnership,
  validateRequest(postVisitSchema),
  updatePostVisitSummary
);

export default router;
