import mongoose from 'mongoose';
import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Appointment } from '../models/Appointment.js';
import { logger } from './logger.js';

export const seedDatabase = async () => {
  try {
    logger.info('🌱 Starting database seed for authentication & test verification...');

    // 1. Create / Upsert Default Admin
    let admin = await User.findOne({ email: 'admin@vibehealth.dev' });
    if (!admin) {
      admin = await User.create({
        name: 'System Administrator',
        email: 'admin@vibehealth.dev',
        password: 'Password123!',
        role: 'admin',
        phone: '+1 800-555-0100',
      });
      logger.info('Created Admin user: admin@vibehealth.dev');
    }

    // 2. Create / Upsert Default Doctor
    let doctor = await User.findOne({ email: 'doctor@vibehealth.dev' });
    if (!doctor) {
      doctor = await User.create({
        name: 'Sarah Mitchell, MD',
        email: 'doctor@vibehealth.dev',
        password: 'Password123!',
        role: 'doctor',
        phone: '+1 800-555-0199',
      });
      logger.info('Created Doctor user: doctor@vibehealth.dev');
    }

    let doctorProfile = await DoctorProfile.findOne({ userId: doctor._id });
    if (!doctorProfile) {
      doctorProfile = await DoctorProfile.create({
        userId: doctor._id,
        specialty: 'Internal Medicine & Cardiology',
        consultationFee: 75,
        bio: 'Board-certified cardiologist specializing in preventive medicine and hypertension care.',
        isAcceptingAppointments: true,
      });
      logger.info('Created Doctor profile');
    }

    // 3. Create / Upsert Default Patient A (Alice)
    let patientA = await User.findOne({ email: 'patient@vibehealth.dev' });
    if (!patientA) {
      patientA = await User.create({
        name: 'Alice Johnson (Patient A)',
        email: 'patient@vibehealth.dev',
        password: 'Password123!',
        role: 'patient',
        phone: '+1 800-555-0122',
      });
      logger.info('Created Patient A user: patient@vibehealth.dev');
    }

    // 4. Create / Upsert Default Patient B (Bob)
    let patientB = await User.findOne({ email: 'patientb@vibehealth.dev' });
    if (!patientB) {
      patientB = await User.create({
        name: 'Bob Smith (Patient B)',
        email: 'patientb@vibehealth.dev',
        password: 'Password123!',
        role: 'patient',
        phone: '+1 800-555-0133',
      });
      logger.info('Created Patient B user: patientb@vibehealth.dev');
    }

    // 5. Create an Appointment for Patient B (to test ownership guard with Patient A)
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 2);
    appointmentDate.setHours(14, 0, 0, 0);

    const endDate = new Date(appointmentDate);
    endDate.setMinutes(endDate.getMinutes() + 30);

    let aptB = await Appointment.findOne({ patientId: patientB._id });
    if (!aptB) {
      aptB = await Appointment.create({
        patientId: patientB._id,
        doctorId: doctor._id,
        startTime: appointmentDate,
        endTime: endDate,
        status: 'confirmed',
        reasonForVisit: 'Routine cardiac health evaluation & ECG follow-up',
        patientNotes: 'Experiencing occasional palpitations after running.',
        consultationFee: 75,
        paymentStatus: 'paid',
        preVisitSummary: {
          symptoms: ['palpitations', 'mild exertional dyspnea'],
          severity: 'moderate',
          triageNotes: 'Symptoms appear exertional. Review baseline ECG.',
        },
      });
      logger.info(`Created Appointment for Patient B with ID: ${aptB._id}`);
    }

    logger.info('✅ Database seed completed successfully!');
    return {
      adminId: admin._id,
      doctorId: doctor._id,
      patientAId: patientA._id,
      patientBId: patientB._id,
      appointmentBId: aptB._id,
    };
  } catch (err) {
    logger.error('Database seed error:', err);
    throw err;
  }
};

// Run directly if invoked from command line
if (process.argv[1]?.endsWith('seed.js')) {
  (async () => {
    await connectDB();
    await seedDatabase();
    await closeDB();
    process.exit(0);
  })();
}
