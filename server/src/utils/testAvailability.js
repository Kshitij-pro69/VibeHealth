/**
 * testAvailability.js
 *
 * Verifies the slot availability engine against a live running server.
 * Requires:
 *   - Server running on http://localhost:5000
 *   - MongoDB accessible (uses seed + direct DB writes for test data)
 *
 * Run: node src/utils/testAvailability.js
 */

import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Leave } from '../models/Leave.js';
import { Appointment } from '../models/Appointment.js';
import { seedDatabase } from './seed.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const BASE_URL = 'http://localhost:5000/api/v1';
const CLINIC_TZ = 'Asia/Kolkata';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const generateToken = (user) =>
  jwt.sign({ userId: user._id, id: user._id, email: user.email, role: user.role }, config.jwt.secret, {
    expiresIn: '1h',
  });

/** YYYY-MM-DD string in IST for a UTC Date (or "today") */
const toISTDateStr = (d = new Date()) =>
  d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });

/** Next occurrence of a given dayOfWeek (0=Sun) from today (IST) */
const nextDayOfWeek = (dow) => {
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
  const [y, m, day] = todayIST.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 1; i <= 7; i++) {
    const candidate = new Date(dt.getTime() + i * 86400000);
    const dayName = candidate.toLocaleDateString('en-US', { timeZone: CLINIC_TZ, weekday: 'short' });
    if (days.indexOf(dayName) === dow) {
      return candidate.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
    }
  }
  return null;
};

// -----------------------------------------------------------------------

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

const fetchSlots = (doctorUserId, date) =>
  fetch(`${BASE_URL}/doctors/${doctorUserId}/availability?date=${date}&tz=${encodeURIComponent(CLINIC_TZ)}`).then(
    (r) => r.json()
  );

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

const run = async () => {
  console.log('\n==================================================');
  console.log('⏱  SLOT AVAILABILITY ENGINE — VERIFICATION SUITE');
  console.log('==================================================\n');

  await connectDB();
  await seedDatabase();

  // --------------------------------------------------------------------
  // Setup: Create a clean test doctor with 9:00–17:00 Mon–Fri, 30-min slots
  // --------------------------------------------------------------------
  const testEmail = `avail.test.${Date.now()}@vibehealth.dev`;
  const testUser = await User.create({
    name: 'Dr. Availability Test',
    email: testEmail,
    password: 'Password123!',
    role: 'doctor',
  });
  const testProfile = await DoctorProfile.create({
    userId: testUser._id,
    specialty: 'Test Specialty',
    consultationFee: 200,
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    isAcceptingAppointments: true,
    workingHours: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
    ],
  });

  const doctorUserId = testUser._id.toString();
  // Pick next Monday (dayOfWeek 1) to avoid "today" past-slot pruning
  const testDate = nextDayOfWeek(1);
  console.log(`  Test doctor userId : ${doctorUserId}`);
  console.log(`  Test date (next Mon): ${testDate}\n`);

  // --------------------------------------------------------------------
  // TEST 1: Full empty day → exactly 16 slots (9am–5pm, 30-min, no buffer)
  // 08:00 shifts → 09:00 to 17:00 exclusive → slots at :00 and :30 each hour
  // Hours: 09,10,11,12,13,14,15,16 = 8 hours × 2 slots = 16
  // --------------------------------------------------------------------
  console.log('── Test 1: Full empty day should return 16 slots ──');
  try {
    const data = await fetchSlots(doctorUserId, testDate);
    const slots = data?.data?.slots ?? [];
    assert('Response success', data?.success === true, JSON.stringify(data));
    assert('Exactly 16 slots on empty 9am–5pm day', slots.length === 16, `Got ${slots.length}`);
    assert('All slots are available', slots.every((s) => s.isAvailable), 'Some unavailable');
    assert('First slot starts at 09:00 IST', fmtTime(slots[0]?.startTime) === '09:00 AM', `Got ${fmtTime(slots[0]?.startTime)}`);
    assert('Last slot starts at 16:30 IST', fmtTime(slots[slots.length - 1]?.startTime) === '04:30 PM', `Got ${fmtTime(slots[slots.length - 1]?.startTime)}`);
    assert('Slot duration is 30 minutes', slots[0]?.durationMinutes === 30, `Got ${slots[0]?.durationMinutes}`);
  } catch (err) {
    assert('Test 1 (full empty day)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 2: Book a confirmed appointment → that slot disappears from results
  // --------------------------------------------------------------------
  console.log('\n── Test 2: Booking an appointment removes its slot ──');
  try {
    // Build the UTC start time for 09:00 IST on testDate
    const [y, m, d] = testDate.split('-').map(Number);
    // IST = UTC+5:30 → 09:00 IST = 03:30 UTC
    const start09UTC = new Date(Date.UTC(y, m - 1, d, 3, 30, 0, 0));
    const end09UTC = new Date(start09UTC.getTime() + 30 * 60000);

    await Appointment.create({
      patientId: (await User.findOne({ email: 'patient@vibehealth.dev' }))._id,
      doctorId: testUser._id,
      startTime: start09UTC,
      endTime: end09UTC,
      status: 'confirmed',
      reasonForVisit: 'Availability engine test booking',
      consultationFee: 200,
    });

    const data = await fetchSlots(doctorUserId, testDate);
    const slots = data?.data?.slots ?? [];
    const has09 = slots.some((s) => fmtTime(s.startTime) === '09:00 AM');

    assert('Slot count is now 15 (one removed)', slots.length === 15, `Got ${slots.length}`);
    assert('09:00 AM slot is absent', !has09, 'Still showing booked slot');
  } catch (err) {
    assert('Test 2 (booking removes slot)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 3: Approved leave covering testDate → zero slots, onLeave: true
  // --------------------------------------------------------------------
  console.log('\n── Test 3: Leave day → onLeave: true, slots: [] ──');
  let leaveDoc = null;
  try {
    const [y, m, d] = testDate.split('-').map(Number);
    const dayStartUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 5.5 * 3600000);
    const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 3600000 - 1);

    leaveDoc = await Leave.create({
      doctorId: testUser._id,
      startDate: dayStartUTC,
      endDate: dayEndUTC,
      reason: 'Conference attendance',
      status: 'approved',
    });

    const data = await fetchSlots(doctorUserId, testDate);
    assert('onLeave flag is true', data?.data?.onLeave === true, JSON.stringify(data?.data?.onLeave));
    assert('slots array is empty on leave day', (data?.data?.slots ?? []).length === 0, `Got ${data?.data?.slots?.length}`);
  } catch (err) {
    assert('Test 3 (leave day)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 4: Day with no working hours (Sunday = 0) → empty slots, no leave flag
  // --------------------------------------------------------------------
  console.log('\n── Test 4: Sunday (no working hours configured) → empty ──');
  try {
    // Remove leave so it doesn't interfere
    if (leaveDoc) await Leave.findByIdAndDelete(leaveDoc._id);

    const sundayDate = nextDayOfWeek(0); // next Sunday
    const data = await fetchSlots(doctorUserId, sundayDate);
    assert('onLeave is false (not leave, just no hours)', data?.data?.onLeave === false, JSON.stringify(data?.data));
    assert('slots array is empty for Sunday', (data?.data?.slots ?? []).length === 0, `Got ${data?.data?.slots?.length}`);
  } catch (err) {
    assert('Test 4 (no working hours)', false, err.message);
  }

  // --------------------------------------------------------------------
  // TEST 5: 15-min slot duration — verify slot count and step
  // --------------------------------------------------------------------
  console.log('\n── Test 5: 15-min slots on a different doctor ──');
  try {
    const d15Email = `avail.15min.${Date.now()}@vibehealth.dev`;
    const user15 = await User.create({
      name: 'Dr. Fifteen Min',
      email: d15Email,
      password: 'Password123!',
      role: 'doctor',
    });
    await DoctorProfile.create({
      userId: user15._id,
      specialty: 'QuickCare',
      consultationFee: 150,
      slotDurationMinutes: 15,
      bufferMinutes: 5,
      isAcceptingAppointments: true,
      workingHours: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', slotDurationMinutes: 15, bufferMinutes: 5 },
      ],
    });

    const data = await fetchSlots(user15._id.toString(), testDate);
    const slots = data?.data?.slots ?? [];
    // 9:00-10:00 with 15-min slot + 5-min buffer = 20-min step → 3 slots (9:00, 9:20, 9:40)
    assert('3 slots in a 60-min window with 15m slot + 5m buffer', slots.length === 3, `Got ${slots.length}: ${JSON.stringify(slots.map(s => fmtTime(s.startTime)))}`);
    assert('Slot duration is 15 minutes', slots[0]?.durationMinutes === 15, `Got ${slots[0]?.durationMinutes}`);
    if (slots.length >= 2) {
      const step = (new Date(slots[1].startTime) - new Date(slots[0].startTime)) / 60000;
      assert('Step between slots is 20 mins (15 + 5 buffer)', step === 20, `Got ${step} min`);
    }

    // Cleanup 15-min test doctor
    await DoctorProfile.findOneAndDelete({ userId: user15._id });
    await User.findByIdAndDelete(user15._id);
  } catch (err) {
    assert('Test 5 (15-min slots)', false, err.message);
  }

  // --------------------------------------------------------------------
  // Cleanup: remove test doctor
  // --------------------------------------------------------------------
  await Appointment.deleteMany({ doctorId: testUser._id });
  await Leave.deleteMany({ doctorId: testUser._id });
  await DoctorProfile.findByIdAndDelete(testProfile._id);
  await User.findByIdAndDelete(testUser._id);

  // --------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------
  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

// Helper used inside tests — same logic as frontend fmtTime
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

if (process.argv[1]?.endsWith('testAvailability.js')) {
  run()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
