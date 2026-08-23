/**
 * testConcurrency.js
 *
 * Automated verification suite for Appointment Booking Concurrency Protection.
 * Runs 10 concurrent hold requests for the exact same doctor and slot, asserting:
 *   - Exactly 1 request succeeds (201 Created)
 *   - Exactly 9 requests fail with 409 Conflict
 * Also tests patient single-hold limit and early confirmation flow.
 *
 * Run: node src/utils/testConcurrency.js
 */

import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Appointment } from '../models/Appointment.js';
import { seedDatabase } from './seed.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const BASE_URL = 'http://localhost:5000/api/v1';
const CLINIC_TZ = 'Asia/Kolkata';

const generateToken = (user) =>
  jwt.sign(
    { userId: user._id, id: user._id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

/** Helper to get next Monday date in YYYY-MM-DD */
const getNextMondayStr = () => {
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
  const [y, m, day] = todayIST.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 1; i <= 7; i++) {
    const candidate = new Date(dt.getTime() + i * 86400000);
    const dayName = candidate.toLocaleDateString('en-US', { timeZone: CLINIC_TZ, weekday: 'short' });
    if (days.indexOf(dayName) === 1) {
      return candidate.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
    }
  }
  return null;
};

export const runConcurrencyTests = async () => {
  console.log('\n==================================================');
  console.log('⚡ CONCURRENCY PROTECTION & ATOMIC HOLD SUITE');
  console.log('==================================================\n');

  await connectDB();
  await seedDatabase();

  let passed = 0;
  let failed = 0;

  const assert = (testName, condition, detail = '') => {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
      failed++;
    }
  };

  // 1. Setup Doctor & Patients
  const docEmail = `concurrency.doc.${Date.now()}@vibehealth.dev`;
  const docUser = await User.create({
    name: 'Dr. Atomic Lock',
    email: docEmail,
    password: 'Password123!',
    role: 'doctor',
  });
  const docProfile = await DoctorProfile.create({
    userId: docUser._id,
    specialty: 'Emergency Medicine',
    consultationFee: 500,
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    isAcceptingAppointments: true,
    workingHours: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
    ],
  });

  const doctorUserId = docUser._id.toString();

  // Create 10 patient accounts
  const patients = [];
  const patientTokens = [];
  for (let i = 1; i <= 10; i++) {
    const pEmail = `concurrent.patient.${i}.${Date.now()}@vibehealth.dev`;
    const pUser = await User.create({
      name: `Patient Concurrent #${i}`,
      email: pEmail,
      password: 'Password123!',
      role: 'patient',
    });
    patients.push(pUser);
    patientTokens.push(generateToken(pUser));
  }

  const testDateStr = getNextMondayStr();
  // 09:00 AM IST on testDateStr in UTC
  const [y, m, d] = testDateStr.split('-').map(Number);
  const startTimeISO = new Date(Date.UTC(y, m - 1, d, 3, 30, 0, 0)).toISOString(); // 09:00 IST = 03:30 UTC
  const endTimeISO = new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0)).toISOString(); // 09:30 IST = 04:00 UTC
  const slot2StartTimeISO = new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0)).toISOString(); // 09:30 IST
  const slot2EndTimeISO = new Date(Date.UTC(y, m - 1, d, 4, 30, 0, 0)).toISOString(); // 10:00 IST

  console.log(`  Doctor ID     : ${doctorUserId}`);
  console.log(`  Target Date   : ${testDateStr}`);
  console.log(`  Target Slot   : ${startTimeISO}`);
  console.log(`  Concurrent Req: 10 Parallel Hold Requests\n`);

  // --------------------------------------------------------------------
  // TEST 1: Fire 10 concurrent hold requests for the exact same slot
  // --------------------------------------------------------------------
  console.log('── Test 1: 10 Concurrent Hold Requests for Same Doctor & Slot ──');
  let winningAppointmentId = null;
  let winningPatientIndex = -1;

  try {
    const holdPromises = patientTokens.map((token, idx) =>
      fetch(`${BASE_URL}/appointments/hold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctorId: doctorUserId,
          startTime: startTimeISO,
          endTime: endTimeISO,
        }),
      }).then(async (res) => ({
        status: res.status,
        data: await res.json().catch(() => ({})),
        patientIndex: idx,
      }))
    );

    const results = await Promise.all(holdPromises);

    const successCount = results.filter((r) => r.status === 201 && r.data?.success === true).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    const winner = results.find((r) => r.status === 201);
    if (winner) {
      winningAppointmentId = winner.data?.data?.appointmentId;
      winningPatientIndex = winner.patientIndex;
    }

    assert('Exactly 1 request succeeded (HTTP 201 Created)', successCount === 1, `Success count: ${successCount}`);
    assert('Exactly 9 requests failed with 409 Conflict', conflictCount === 9, `Conflict count: ${conflictCount}`);
    assert(
      'Winner response returned appointmentId and expiresAt',
      Boolean(winningAppointmentId && winner?.data?.data?.expiresAt),
      JSON.stringify(winner?.data)
    );
  } catch (err) {
    assert('Test 1 (10 Concurrent Holds)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 2: Single-Hold Patient Limit
  // Winner attempts to hold a SECOND slot while already holding slot 1
  // --------------------------------------------------------------------
  console.log('\n── Test 2: Patient Single-Hold Limit Across Platform ──');
  try {
    if (winningPatientIndex >= 0) {
      const winnerToken = patientTokens[winningPatientIndex];
      const res = await fetch(`${BASE_URL}/appointments/hold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${winnerToken}`,
        },
        body: JSON.stringify({
          doctorId: doctorUserId,
          startTime: slot2StartTimeISO,
          endTime: slot2EndTimeISO,
        }),
      });
      const data = await res.json().catch(() => ({}));

      assert(
        'Patient attempting 2nd concurrent hold receives HTTP 409 Conflict',
        res.status === 409,
        `Status ${res.status}: ${JSON.stringify(data)}`
      );
    } else {
      assert('Test 2 skipped (no winner from Test 1)', false);
    }
  } catch (err) {
    assert('Test 2 (Single-Hold Limit)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 3: Confirm Booking Flow
  // Winner confirms their held appointment with symptom intake data
  // --------------------------------------------------------------------
  console.log('\n── Test 3: Confirm Booking for Held Appointment ──');
  try {
    if (winningAppointmentId && winningPatientIndex >= 0) {
      const winnerToken = patientTokens[winningPatientIndex];
      const res = await fetch(`${BASE_URL}/appointments/${winningAppointmentId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${winnerToken}`,
        },
        body: JSON.stringify({
          reasonForVisit: 'Acute migraine and visual aura',
          patientNotes: 'Symptoms started 2 hours ago. On paracetamol.',
        }),
      });
      const data = await res.json().catch(() => ({}));

      assert(
        'Confirming held appointment returns 200 OK with status=confirmed',
        res.status === 200 && data?.data?.appointment?.status === 'confirmed',
        `Status ${res.status}: ${JSON.stringify(data)}`
      );

      // Verify DB state
      const dbApt = await Appointment.findById(winningAppointmentId);
      assert('MongoDB appointment status is confirmed', dbApt?.status === 'confirmed', `Got status: ${dbApt?.status}`);
      assert('MongoDB appointment has reasonForVisit set', dbApt?.reasonForVisit === 'Acute migraine and visual aura');
    } else {
      assert('Test 3 skipped (no winner)', false);
    }
  } catch (err) {
    assert('Test 3 (Confirm Booking)', false, err.message);
  }

  // --------------------------------------------------------------------
  // Cleanup Test Data
  // --------------------------------------------------------------------
  await Appointment.deleteMany({ doctorId: docUser._id });
  await DoctorProfile.findByIdAndDelete(docProfile._id);
  await User.findByIdAndDelete(docUser._id);
  for (const p of patients) {
    await User.findByIdAndDelete(p._id);
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testConcurrency.js')) {
  runConcurrencyTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
