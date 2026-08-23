import { Router } from 'express';
import {
  register,
  login,
  getMe,
  initiateGoogleOAuth,
  handleGoogleOAuthCallback,
  getCalendarStatus,
  disconnectCalendar,
  registerSchema,
  loginSchema,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

router.post('/register', validateRequest(registerSchema), register);
router.post('/login', validateRequest(loginSchema), login);
router.get('/me', authenticate, getMe);

// Google OAuth 2.0 Integration Routes
router.get('/google', initiateGoogleOAuth);
router.get('/google/callback', handleGoogleOAuthCallback);
router.get('/calendar-status', authenticate, getCalendarStatus);
router.post('/disconnect-calendar', authenticate, disconnectCalendar);

export default router;

