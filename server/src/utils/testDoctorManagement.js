import mongoose from 'mongoose';
import { connectDB, closeDB } from '../config/db.js';
import { seedDatabase } from './seed.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const BASE_URL = 'http://localhost:5000/api/v1';

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      id: user._id,
      email: user.email,
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: '1h' }
  );
};

export const runDoctorManagementTests = async () => {
  console.log('\n==================================================');
  console.log('🩺 RUNNING ADMIN DOCTOR PROFILE MANAGEMENT SUITE');
  console.log('==================================================\n');

  await connectDB();
  const seed = await seedDatabase();

  const admin = await User.findById(seed.adminId);
  const patientA = await User.findById(seed.patientAId);

  const adminToken = generateToken(admin);
  const patientAToken = generateToken(patientA);

  let passed = 0;
  let failed = 0;

  const assert = (testName, condition, detail = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${detail}`);
      failed++;
    }
  };

  // 1. Non-admin attempting to create a doctor -> MUST BE 403 Forbidden
  try {
    const res = await fetch(`${BASE_URL}/admin/doctors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        name: 'Dr. Unauthorized Hacker',
        email: 'hacker@vibehealth.dev',
        specialty: 'Radiology',
        consultationFee: 100,
      }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      'Patient attempting to create doctor receives 403 Forbidden',
      res.status === 403,
      `Status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Patient creating doctor receives 403 Forbidden', false, err.message);
  }

  // 2. Admin creates Doctor 1: Dr. Emily Vance (Dermatology, 15 min slots, 5 min buffer)
  const doc1Email = `emily.vance.${Date.now()}@vibehealth.dev`;
  let doctor1ProfileId = null;
  let doctor1UserId = null;

  try {
    const res = await fetch(`${BASE_URL}/admin/doctors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Dr. Emily Vance',
        email: doc1Email,
        specialty: 'Dermatology',
        consultationFee: 80,
        slotDurationMinutes: 15,
        bufferMinutes: 5,
        bio: 'Board-certified clinical dermatologist with a focus on skin cancer screening.',
        workingHours: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotDurationMinutes: 15, bufferMinutes: 5 },
          { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotDurationMinutes: 15, bufferMinutes: 5 },
          { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', slotDurationMinutes: 15, bufferMinutes: 5 },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    doctor1ProfileId = data?.data?.doctor?.profileId;
    doctor1UserId = data?.data?.doctor?.userId;

    assert(
      'Admin creates Doctor 1 (Dermatology, 15m slot, 5m buffer) -> 201 Created',
      res.status === 201 && data?.data?.doctor?.specialty === 'Dermatology' && data?.data?.doctor?.slotDurationMinutes === 15,
      `Status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Admin creates Doctor 1', false, err.message);
  }

  // 3. Admin creates Doctor 2: Dr. Robert Chen (Neurology, 30 min slots, 10 min buffer)
  const doc2Email = `robert.chen.${Date.now()}@vibehealth.dev`;
  let doctor2ProfileId = null;
  let doctor2UserId = null;

  try {
    const res = await fetch(`${BASE_URL}/admin/doctors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Dr. Robert Chen',
        email: doc2Email,
        specialisation: 'Neurology',
        consultationFee: 120,
        slotDurationMinutes: 30,
        bufferMinutes: 10,
        bio: 'Consultant neurologist specializing in headache disorders and stroke rehabilitation.',
        workingHours: [
          { dayOfWeek: 1, startTime: '10:00', endTime: '13:00', slotDurationMinutes: 30, bufferMinutes: 10 },
          { dayOfWeek: 3, startTime: '10:00', endTime: '13:00', slotDurationMinutes: 30, bufferMinutes: 10 },
          { dayOfWeek: 5, startTime: '10:00', endTime: '13:00', slotDurationMinutes: 30, bufferMinutes: 10 },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    doctor2ProfileId = data?.data?.doctor?.profileId;
    doctor2UserId = data?.data?.doctor?.userId;

    assert(
      'Admin creates Doctor 2 (Neurology, 30m slot, 10m buffer) -> 201 Created',
      res.status === 201 && data?.data?.doctor?.specialty === 'Neurology' && data?.data?.doctor?.slotDurationMinutes === 30,
      `Status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Admin creates Doctor 2', false, err.message);
  }

  // 4. Admin lists doctors with specialty filter 'Dermatology'
  try {
    const res = await fetch(`${BASE_URL}/admin/doctors?specialty=Dermatology`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json().catch(() => ({}));
    const hasDoc1 = data?.data?.doctors?.some((d) => d.specialty === 'Dermatology' && d.userId?.name === 'Dr. Emily Vance');
    const hasDoc2 = data?.data?.doctors?.some((d) => d.specialty === 'Neurology');

    assert(
      "Admin lists doctors filtered by specialty=Dermatology (includes Dr. Emily Vance, excludes Neurology)",
      res.status === 200 && hasDoc1 && !hasDoc2,
      `Result: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Specialty filter test', false, err.message);
  }

  // 5. Admin lists doctors with specialty filter 'Neurology'
  try {
    const res = await fetch(`${BASE_URL}/admin/doctors?specialty=Neurology`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json().catch(() => ({}));
    const hasDoc2 = data?.data?.doctors?.some((d) => d.specialty === 'Neurology' && d.userId?.name === 'Dr. Robert Chen');
    const hasDoc1 = data?.data?.doctors?.some((d) => d.specialty === 'Dermatology');

    assert(
      "Admin lists doctors filtered by specialty=Neurology (includes Dr. Robert Chen, excludes Dermatology)",
      res.status === 200 && hasDoc2 && !hasDoc1,
      `Result: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Specialty filter test (Neurology)', false, err.message);
  }

  // 6. Verify Slot Generation for Doctor 1 (15-min duration + 5-min buffer = 20-min step)
  try {
    // Find next Monday date for testing
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); // Next Monday
    const mondayStr = d.toISOString().split('T')[0];

    const res = await fetch(`${BASE_URL}/doctors/${doctor1UserId}/slots?date=${mondayStr}`);
    const data = await res.json().catch(() => ({}));
    const slots = data?.data?.slots || [];

    // Check first two slots
    // 09:00 -> 09:15, 09:20 -> 09:35
    const slot0Duration = (new Date(slots[0].endTime) - new Date(slots[0].startTime)) / 60000;
    const stepDiff = slots.length > 1 ? (new Date(slots[1].startTime) - new Date(slots[0].startTime)) / 60000 : 0;

    assert(
      `Doctor 1 slot calculation: slot duration is 15 mins, step is 20 mins (15m slot + 5m buffer)`,
      slots.length > 0 && slot0Duration === 15 && stepDiff === 20,
      `Slots: ${JSON.stringify(slots.slice(0, 2))}`
    );
  } catch (err) {
    assert('Doctor 1 slot calculation', false, err.message);
  }

  // 7. Verify Slot Generation for Doctor 2 (30-min duration + 10-min buffer = 40-min step)
  try {
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); // Next Monday
    const mondayStr = d.toISOString().split('T')[0];

    const res = await fetch(`${BASE_URL}/doctors/${doctor2UserId}/slots?date=${mondayStr}`);
    const data = await res.json().catch(() => ({}));
    const slots = data?.data?.slots || [];

    const slot0Duration = (new Date(slots[0].endTime) - new Date(slots[0].startTime)) / 60000;
    const stepDiff = slots.length > 1 ? (new Date(slots[1].startTime) - new Date(slots[0].startTime)) / 60000 : 0;

    assert(
      `Doctor 2 slot calculation: slot duration is 30 mins, step is 40 mins (30m slot + 10m buffer)`,
      slots.length > 0 && slot0Duration === 30 && stepDiff === 40,
      `Slots: ${JSON.stringify(slots.slice(0, 2))}`
    );
  } catch (err) {
    assert('Doctor 2 slot calculation', false, err.message);
  }

  // 8. Admin edits Doctor 1 profile (consultationFee: 95)
  try {
    const res = await fetch(`${BASE_URL}/admin/doctors/${doctor1ProfileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        consultationFee: 95,
        bio: 'Updated bio with extensive dermatologic surgery background.',
      }),
    });
    const data = await res.json().catch(() => ({}));

    assert(
      'Admin updates Doctor 1 consultation fee to $95 and bio -> 200 OK',
      res.status === 200 && data?.data?.doctor?.consultationFee === 95,
      `Status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Admin updates Doctor 1', false, err.message);
  }

  // 9. Admin deactivates Doctor 1
  try {
    const res = await fetch(`${BASE_URL}/admin/doctors/${doctor1ProfileId}/toggle-status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json().catch(() => ({}));

    assert(
      'Admin toggles Doctor 1 status to deactivated (isAcceptingAppointments: false, isActive: false) -> 200 OK',
      res.status === 200 && data?.data?.isAcceptingAppointments === false,
      `Status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Admin deactivates Doctor 1', false, err.message);
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testDoctorManagement.js')) {
  runDoctorManagementTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
