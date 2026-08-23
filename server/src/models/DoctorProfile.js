import mongoose from 'mongoose';

const workingHourSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      required: true,
      min: 0,
      max: 6,
    },
    startTime: {
      type: String, // e.g. "09:00"
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Please provide time in HH:MM format'],
    },
    endTime: {
      type: String, // e.g. "17:00"
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Please provide time in HH:MM format'],
    },
    slotDurationMinutes: {
      type: Number,
      default: 30,
      min: 10,
      max: 120,
    },
  },
  { _id: false }
);

const doctorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
      index: true,
    },
    specialty: {
      type: String,
      required: [true, 'Specialty is required'],
      trim: true,
      index: true,
    },
    qualifications: {
      type: [String],
      default: [],
    },
    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    consultationFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
      min: 0,
    },
    workingHours: {
      type: [workingHourSchema],
      default: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 },
      ],
    },
    slotHoldsDurationSeconds: {
      type: Number,
      default: 300, // 5 minutes default hold time in Redis
    },
    googleOAuthTokens: {
      accessToken: { type: String, select: false },
      refreshToken: { type: String, select: false },
      expiryDate: { type: Number, select: false },
      scope: { type: String, select: false },
      tokenType: { type: String, select: false },
    },
    isAcceptingAppointments: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);
