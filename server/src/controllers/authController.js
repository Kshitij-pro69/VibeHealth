import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { config } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';

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
