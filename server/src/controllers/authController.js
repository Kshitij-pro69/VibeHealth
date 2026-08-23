import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { config } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { CalendarService } from '../services/calendarService.js';
import { logger } from '../utils/logger.js';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must have at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['patient', 'doctor', 'admin']).optional().default('patient'),
  phone: z.string().optional(),
  // Doctor specific fields if registering as doctor
  specialty: z.string().optional(),
  consultationFee: z.number().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      id: user._id,
      email: user.email,
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone, specialty, consultationFee } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return ApiResponse.error(res, 'An account with this email address already exists.', 409);
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone: phone || '',
    });

    // If registering as a doctor, auto-initialize doctor profile
    if (role === 'doctor') {
      await DoctorProfile.create({
        userId: user._id,
        specialty: specialty || 'General Practice',
        consultationFee: consultationFee || 50,
      });
    }

    const token = generateToken(user);

    return ApiResponse.created(
      res,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
        },
        token,
      },
      'User registered successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return ApiResponse.error(res, 'Invalid email or password credentials.', 401);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return ApiResponse.error(res, 'Invalid email or password credentials.', 401);
    }

    if (!user.isActive) {
      return ApiResponse.error(res, 'Your account has been deactivated.', 403);
    }

    const token = generateToken(user);

    return ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
        },
        token,
      },
      'Login successful'
    );
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    let profile = null;
    if (req.user.role === 'doctor') {
      profile = await DoctorProfile.findOne({ userId: req.user._id });
    }

    return ApiResponse.success(res, {
      user: req.user,
      doctorProfile: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiates Google OAuth 2.0 Consent Flow for Calendar integration.
 */
export const initiateGoogleOAuth = async (req, res, next) => {
  try {
    let userId = req.user?._id;

    // Support token query parameter if called directly via window.location.href
    if (!userId && req.query.token) {
      try {
        const decoded = jwt.verify(req.query.token, config.jwt.secret);
        userId = decoded.userId || decoded.id;
      } catch (tokenErr) {
        return res.status(401).send('Invalid token specified for Google authentication.');
      }
    }

    if (!userId) {
      return ApiResponse.error(res, 'Authentication required to connect Google Calendar.', 401);
    }

    const authUrl = CalendarService.getAuthUrl(userId);
    if (!authUrl) {
      return ApiResponse.error(res, 'Google Calendar integration credentials not configured on server.', 500);
    }

    return res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * Handles Google OAuth 2.0 Callback, exchanges authorization code for tokens, and persists user connection.
 */
export const handleGoogleOAuthCallback = async (req, res, next) => {
  try {
    const { code, state: userId, error: oauthError } = req.query;

    if (oauthError) {
      logger.warn(`Google OAuth error reported in callback: ${oauthError}`);
      return res.redirect(`${config.clientUrl}/settings?calendar=error&message=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !userId) {
      return res.redirect(`${config.clientUrl}/settings?calendar=error&message=missing_code_or_state`);
    }

    const result = await CalendarService.exchangeCodeForTokens(code);
    if (!result.success || !result.tokens) {
      logger.error(`Failed to exchange code for tokens in OAuth callback: ${result.error}`);
      return res.redirect(`${config.clientUrl}/settings?calendar=error&message=token_exchange_failed`);
    }

    const tokens = result.tokens;

    // Persist tokens to User document
    await User.findByIdAndUpdate(userId, {
      calendarStatus: 'connected',
      googleTokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        scope: tokens.scope,
        token_type: tokens.token_type,
      },
    });

    // Also mirror to DoctorProfile if user is a physician
    const userDoc = await User.findById(userId);
    if (userDoc?.role === 'doctor') {
      await DoctorProfile.findOneAndUpdate(
        { userId },
        {
          googleOAuthTokens: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiryDate: tokens.expiry_date,
            scope: tokens.scope,
            tokenType: tokens.token_type,
          },
        }
      );
    }

    logger.info(`Successfully connected Google Calendar for user #${userId}`);
    return res.redirect(`${config.clientUrl}/settings?calendar=connected`);
  } catch (error) {
    logger.error('Unhandled error in Google OAuth callback:', { error: error.message });
    return res.redirect(`${config.clientUrl}/settings?calendar=error&message=server_error`);
  }
};

/**
 * Gets Google Calendar connection status for the logged-in user.
 */
export const getCalendarStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('calendarStatus');
    return ApiResponse.success(res, {
      calendarStatus: user?.calendarStatus || 'not_connected',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disconnects Google Calendar and clears stored tokens for the logged-in user.
 */
export const disconnectCalendar = async (req, res, next) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      calendarStatus: 'not_connected',
      $unset: { googleTokens: 1 },
    });

    if (req.user.role === 'doctor') {
      await DoctorProfile.findOneAndUpdate(
        { userId },
        { $unset: { googleOAuthTokens: 1 } }
      );
    }

    return ApiResponse.success(res, { calendarStatus: 'not_connected' }, 'Google Calendar disconnected.');
  } catch (error) {
    next(error);
  }
};

