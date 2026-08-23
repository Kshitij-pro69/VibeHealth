import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor ID is required'],
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'approved',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index to quickly query active doctor leaves for a time range
leaveSchema.index({ doctorId: 1, startDate: 1, endDate: 1 });

export const Leave = mongoose.model('Leave', leaveSchema);
