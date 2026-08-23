import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    recipientEmail: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'appointment_booked',
        'appointment_confirmed',
        'appointment_cancelled',
        'appointment_reminder',
        'pre_visit_ready',
        'post_visit_ready',
        'medication_reminder',
        'system',
        'doctor_credentials',
        'rebooking_prompt',
      ],
      required: true,
      index: true,
    },
    emailType: {
      type: String,
      enum: [
        'booking_confirmation',
        'appointment_reminder',
        'cancellation',
        'doctor_leave_cancellation',
        'rebooking_prompt',
        'post_visit_summary',
        'doctor_credentials',
        'medication_reminder',
        'custom_email',
      ],
      default: 'custom_email',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
    jobId: {
      type: String,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
      },
      doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      link: String,
      extra: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user notification inbox queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Index for admin notification audit log filtering & pagination
notificationSchema.index({ deliveryStatus: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);

