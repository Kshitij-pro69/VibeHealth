import mongoose from 'mongoose';

const preVisitSummarySchema = new mongoose.Schema(
  {
    // Pipeline status — set to 'pending' at booking confirmation time;
    // updated to 'completed' or 'failed' by the BullMQ LLM worker.
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    // AI-generated fields (populated only when status === 'completed')
    urgency: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: null,
    },
    chiefComplaint: {
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
    disclaimer: {
      type: String,
      default: 'Clinician-Reference Triage Assistance only. Not authoritative medical advice.',
    },
    // Verbatim patient symptom text — preserved for fallback display on AI failure
    rawSymptomText: {
      type: String,
      default: '',
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
    // --- Structured patient symptom intake (collected during hold window before confirmation) ---
    symptomDescription: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    symptomDuration: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    symptomSeverity: {
      type: Number,
      min: 1,
      max: 10,
      default: null,
    },
    existingConditions: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    currentMedications: {
      type: String,
      trim: true,
      maxlength: 1000,
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
