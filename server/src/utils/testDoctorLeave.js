/**
 * testDoctorLeave.js
 *
 * Automated verification suite for Doctor Leave Management & Booking Conflict Resolution.
 * Verifies:
 *   1. Pre-cancellation conflict detection (preview count: 3)
 *   2. Non-silent conflict warning (HTTP 409 requiresConfirmation: true)
 *   3. Confirmed leave creation -> 3 appointments cancelled with 'doctor_unavailable'
 *   4. Automated patient notification records (3 Notification documents created)
 *   5. Leave removal safeguard (deleting leave does NOT restore cancelled appointments)
 *
 * Run: node src/utils/testDoctorLeave.js
 */

import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Appointment } from '../models/Appointment.js';
import { Leave } from '../models/Leave.js';
import { Notification } from '../models/Notification.js';
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

export const runDoctorLeaveTests = async () => {
  console.log('\n==================================================');
  console.log('🩺 DOCTOR LEAVE & CONFLICT RESOLUTION SUITE');
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

  // 1. Setup Doctor & 3 Patients
  const docUser = await User.create({
    name: 'Dr. Schedule Leave',
    email: `leave.doc.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'doctor',
  });
  const docProfile = await DoctorProfile.create({
    userId: docUser._id,
    specialty: 'Orthopedics',
    consultationFee: 400,
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    isAcceptingAppointments: true,
    workingHours: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
    ],
  });

  const docToken = generateToken(docUser);
  const testDateStr = getNextMondayStr();
  const [y, m, d] = testDateStr.split('-').map(Number);

  // Create 3 patients
  const patientA = await User.create({
    name: 'Leave Patient A',
    email: `leave.patient.a.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'patient',
  });
  const patientB = await User.create({
    name: 'Leave Patient B',
    email: `leave.patient.b.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'patient',
  });
  const patientC = await User.create({
    name: 'Leave Patient C',
    email: `leave.patient.c.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'patient',
  });

  // Create 3 confirmed appointments on testDateStr
  // Apt 1: 09:00 - 09:30 IST (03:30 - 04:00 UTC)
  const apt1Start = new Date(Date.UTC(y, m - 1, d, 3, 30, 0, 0));
  const apt1End = new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0));
  const apt1 = await Appointment.create({
    patientId: patientA._id,
    doctorId: docUser._id,
    startTime: apt1Start,
    endTime: apt1End,
    status: 'confirmed',
    reasonForVisit: 'Knee ligament evaluation',
    consultationFee: 400,
    paymentStatus: 'paid',
  });

  // Apt 2: 10:00 - 10:30 IST (04:30 - 05:00 UTC)
  const apt2Start = new Date(Date.UTC(y, m - 1, d, 4, 30, 0, 0));
  const apt2End = new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
  const apt2 = await Appointment.create({
    patientId: patientB._id,
    doctorId: docUser._id,
    startTime: apt2Start,
    endTime: apt2End,
    status: 'confirmed',
    reasonForVisit: 'Shoulder MRI follow-up',
    consultationFee: 400,
    paymentStatus: 'paid',
  });

  // Apt 3: 11:00 - 11:30 IST (05:30 - 06:00 UTC)
  const apt3Start = new Date(Date.UTC(y, m - 1, d, 5, 30, 0, 0));
  const apt3End = new Date(Date.UTC(y, m - 1, d, 6, 0, 0, 0));
  const apt3 = await Appointment.create({
    patientId: patientC._id,
    doctorId: docUser._id,
    startTime: apt3Start,
    endTime: apt3End,
    status: 'confirmed',
    reasonForVisit: 'Ankle fracture assessment',
    consultationFee: 400,
    paymentStatus: 'paid',
  });

  console.log(`  Doctor ID: ${docUser._id}`);
  console.log(`  Test Date: ${testDateStr}`);
  console.log(`  Created 3 Confirmed Appointments for Patient A, B, C\n`);

  // --------------------------------------------------------------------
  // TEST 1: Preview Leave Conflicts Endpoint (POST /doctors/leave/preview)
  // --------------------------------------------------------------------
  console.log('── Test 1: Preview Leave Conflicts Endpoint ──');
  try {
    const res = await fetch(`${BASE_URL}/doctors/leave/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      body: JSON.stringify({
        startDate: testDateStr,
        endDate: testDateStr,
      }),
    });
    const data = await res.json().catch(() => ({}));

    assert('Preview request returns HTTP 200 OK', res.status === 200, `Status: ${res.status}`);
    assert('Preview conflict count is 3', data?.data?.count === 3, `Got count: ${data?.data?.count}`);
    assert('Preview returns 3 appointment details', data?.data?.appointments?.length === 3);
  } catch (err) {
    assert('Test 1 (Leave Preview)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 2: Non-Silent Conflict Safeguard (POST /doctors/leave without confirm)
  // --------------------------------------------------------------------
  console.log('\n── Test 2: Non-Silent Conflict Safeguard (Requires Confirmation) ──');
  try {
    const res = await fetch(`${BASE_URL}/doctors/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      body: JSON.stringify({
        startDate: testDateStr,
        endDate: testDateStr,
        reason: 'Attending Orthopedic Conference',
        // confirmCancelBookings is omitted
      }),
    });
    const data = await res.json().catch(() => ({}));

    assert('Submitting leave with conflicts without confirm returns HTTP 409 Conflict', res.status === 409, `Status: ${res.status}`);
    assert('Error payload indicates requiresConfirmation: true', data?.error?.requiresConfirmation === true || data?.requiresConfirmation === true, JSON.stringify(data));
    assert('Error payload reports count: 3', (data?.error?.count || data?.count) === 3);

    // Verify DB remains untouched
    const leaveCount = await Leave.countDocuments({ doctorId: docUser._id });
    const confirmedCount = await Appointment.countDocuments({
      _id: { $in: [apt1._id, apt2._id, apt3._id] },
      status: 'confirmed',
    });

    assert('Zero leave documents created in DB before confirmation', leaveCount === 0);
    assert('All 3 appointments remain in status=confirmed', confirmedCount === 3);
  } catch (err) {
    assert('Test 2 (Conflict Safeguard)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 3: Confirmed Leave Creation & Automated Cancellation Dispatches
  // --------------------------------------------------------------------
  console.log('\n── Test 3: Confirmed Leave Creation & Cancellation Dispatches ──');
  let createdLeaveId = null;
  try {
    const res = await fetch(`${BASE_URL}/doctors/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      body: JSON.stringify({
        startDate: testDateStr,
        endDate: testDateStr,
        reason: 'Attending Orthopedic Conference',
        confirmCancelBookings: true,
      }),
    });
    const data = await res.json().catch(() => ({}));

    assert('Confirmed leave submission returns HTTP 201 Created', res.status === 201, `Status: ${res.status}`);
    assert('Response reports 3 cancelled appointments', data?.data?.cancelledAppointmentsCount === 3, JSON.stringify(data));

    createdLeaveId = data?.data?.leave?._id;

    // Verify DB Appointments flipped to cancelled with doctor_unavailable reason
    const cancelledAppts = await Appointment.find({
      _id: { $in: [apt1._id, apt2._id, apt3._id] },
    });

    const allCancelled = cancelledAppts.every((a) => a.status === 'cancelled');
    const allReasonSet = cancelledAppts.every((a) => a.cancellationReason === 'doctor_unavailable');
    const allTimestamped = cancelledAppts.every((a) => Boolean(a.cancelledAt));

    assert('All 3 appointments updated to status=cancelled', allCancelled);
    assert('All 3 appointments have cancellationReason=doctor_unavailable', allReasonSet);
    assert('All 3 appointments have cancelledAt timestamp populated', allTimestamped);

    // Verify DB Notification documents created for Patient A, B, C
    const notifications = await Notification.find({
      userId: { $in: [patientA._id, patientB._id, patientC._id] },
      type: 'appointment_cancelled',
    });

    assert('Exactly 3 Notification documents created in DB for patients', notifications.length === 3, `Got ${notifications.length}`);
  } catch (err) {
    assert('Test 3 (Confirmed Leave Creation)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 4: Delete Leave Safeguard (Does NOT un-cancel appointments)
  // --------------------------------------------------------------------
  console.log('\n── Test 4: Delete Leave Safeguard ──');
  try {
    if (createdLeaveId) {
      const res = await fetch(`${BASE_URL}/doctors/leave/${createdLeaveId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${docToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));

      assert('Deleting leave returns HTTP 200 OK', res.status === 200, `Status: ${res.status}`);

      // Verify Leave document is deleted from DB
      const deletedLeave = await Leave.findById(createdLeaveId);
      assert('Leave document is deleted from MongoDB', deletedLeave === null);

      // Verify the 3 appointments REMAIN CANCELLED
      const remainingCancelled = await Appointment.find({
        _id: { $in: [apt1._id, apt2._id, apt3._id] },
        status: 'cancelled',
      });

      assert('Safeguard check: All 3 appointments REMAIN cancelled after leave deletion', remainingCancelled.length === 3);
    } else {
      assert('Test 4 skipped (no leave created in Test 3)', false);
    }
  } catch (err) {
    assert('Test 4 (Delete Leave Safeguard)', false, err.message);
  }

  // --------------------------------------------------------------------
  // Cleanup Test Data
  // --------------------------------------------------------------------
  await Appointment.deleteMany({ doctorId: docUser._id });
  await Notification.deleteMany({ userId: { $in: [patientA._id, patientB._id, patientC._id] } });
  await Leave.deleteMany({ doctorId: docUser._id });
  await DoctorProfile.findByIdAndDelete(docProfile._id);
  await User.findByIdAndDelete(docUser._id);
  await User.deleteMany({ _id: { $in: [patientA._id, patientB._id, patientC._id] } });

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testDoctorLeave.js')) {
  runDoctorLeaveTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
