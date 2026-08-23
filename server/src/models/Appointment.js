import mongoose from 'mongoose';

const preVisitSummarySchema = new mongoose.Schema(
  {
    disclaimer: {
      type: String,
      default: 'Clinician-Reference Triage Assistance only. Not authoritative medical advice.',
    },
    symptoms: {
      type: [String],
      default: [],
    },
    severity: {
      type: String,
      enum: ['low', 'moderate', 'high', 'emergency', 'unknown'],
      default: 'unknown',
    },
    triageNotes: {
      type: String,
      default: '',
    },
    suggestedQuestions: {
      type: [String],
      default: [],
    },
    aiGeneratedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const postVisitSummarySchema = new mongoose.Schema(
  {
    clinicalNotes: {
      type: String,
      default: '',
    },
    diagnosis: {
      type: String,
      default: '',
    },
    prescriptions: [
      {
        medicationName: String,
        dosage: String,
        frequency: String,
        durationDays: Number,
        instructions: String,
      },
    ],
    doctorApproved: {
      type: Boolean,
      default: false, // Must be true before patient can view post-visit summary
    },
    doctorApprovedAt: {
      type: Date,
    },
    doctorEditedNotes: {
      type: String,
      default: '',
    },
    patientVisibleAt: {
      type: Date,
    },
  },
  { _id: false }
);

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor ID is required'],
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true,
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    status: {
      type: String,
      enum: ['held', 'confirmed', 'cancelled', 'completed', 'no-show'],
      default: 'held',
      index: true,
    },
    reasonForVisit: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    patientNotes: {
      type: String,
      trim: true,
      default: '',
    },
    preVisitSummary: {
      type: preVisitSummarySchema,
      default: () => ({}),
    },
    postVisitSummary: {
      type: postVisitSummarySchema,
      default: () => ({}),
    },
    calendarEventId: {
      type: String,
      default: null,
    },
    slotHoldExpiresAt: {
      type: Date,
      default: null,
    },
    consultationFee: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// COMPOUND UNIQUE INDEX WITH PARTIAL FILTER EXPRESSION:
// Ensures a doctor cannot be double-booked for the same start time if the appointment is active ('held' or 'confirmed').
// Cancelled or completed appointments do not block that slot from being rebooked.
appointmentSchema.index(
  { doctorId: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['held', 'confirmed'] },
    },
    name: 'unique_active_doctor_slot',
  }
);

// Secondary query index for patient appointment histories
appointmentSchema.index({ patientId: 1, startTime: -1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
