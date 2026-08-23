import mongoose from 'mongoose';
import { connectDB, closeDB } from '../config/db.js';
import { seedDatabase } from './seed.js';
import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
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

export const runAuthOwnershipTests = async () => {
  console.log('\n==================================================');
  console.log('🧪 RUNNING AUTHENTICATION & OWNERSHIP SUITE');
  console.log('==================================================\n');

  // Connect & Seed
  await connectDB();
  const seed = await seedDatabase();

  const patientA = await User.findById(seed.patientAId);
  const patientB = await User.findById(seed.patientBId);
  const doctor = await User.findById(seed.doctorId);
  const admin = await User.findById(seed.adminId);
  const appointmentB = await Appointment.findById(seed.appointmentBId);

  const patientAToken = generateToken(patientA);
  const patientBToken = generateToken(patientB);
  const doctorToken = generateToken(doctor);
  const adminToken = generateToken(admin);

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

  // 1. Patient A hitting Admin Route -> MUST BE 403 Forbidden
  try {
    const res = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${patientAToken}` },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      'Patient A accessing Admin Route (/api/v1/admin/users) receives 403 Forbidden',
      res.status === 403,
      `Received status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Patient A accessing Admin Route receives 403 Forbidden', false, err.message);
  }

  // 2. Admin hitting Admin Route -> MUST BE 200 OK
  try {
    const res = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      'Admin accessing Admin Route (/api/v1/admin/users) receives 200 OK',
      res.status === 200 && data.success === true,
      `Received status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Admin accessing Admin Route receives 200 OK', false, err.message);
  }

  // 3. Patient A attempting to access Patient B's appointment -> MUST BE 403 Forbidden
  try {
    const res = await fetch(`${BASE_URL}/appointments/${appointmentB._id}`, {
      headers: { Authorization: `Bearer ${patientAToken}` },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      `Patient A reading Patient B's appointment (/api/v1/appointments/${appointmentB._id}) receives 403 Forbidden`,
      res.status === 403,
      `Received status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert("Patient A accessing Patient B's appointment receives 403 Forbidden", false, err.message);
  }

  // 4. Patient B accessing their OWN appointment -> MUST BE 200 OK
  try {
    const res = await fetch(`${BASE_URL}/appointments/${appointmentB._id}`, {
      headers: { Authorization: `Bearer ${patientBToken}` },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      `Patient B reading their OWN appointment (/api/v1/appointments/${appointmentB._id}) receives 200 OK`,
      res.status === 200 && data.success === true,
      `Received status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert("Patient B accessing their OWN appointment receives 200 OK", false, err.message);
  }

  // 5. Assigned Doctor accessing the appointment -> MUST BE 200 OK
  try {
    const res = await fetch(`${BASE_URL}/appointments/${appointmentB._id}`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      `Assigned Doctor reading appointment (/api/v1/appointments/${appointmentB._id}) receives 200 OK`,
      res.status === 200 && data.success === true,
      `Received status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Assigned Doctor reading appointment receives 200 OK', false, err.message);
  }

  // 6. Unauthenticated request -> MUST BE 401 Unauthorized
  try {
    const res = await fetch(`${BASE_URL}/appointments/${appointmentB._id}`);
    const data = await res.json().catch(() => ({}));
    assert(
      'Unauthenticated request to appointment receives 401 Unauthorized',
      res.status === 401,
      `Received status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    assert('Unauthenticated request receives 401', false, err.message);
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testAuthOwnership.js')) {
  runAuthOwnershipTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
