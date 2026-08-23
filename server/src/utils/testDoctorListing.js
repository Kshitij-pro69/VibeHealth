/**
 * testDoctorListing.js
 *
 * Verification suite for Doctor Listing, raw document count logging,
 * isAcceptingAppointments filtering, and User populate recovery fallback.
 *
 * Run: node src/utils/testDoctorListing.js
 */

import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { seedDatabase } from './seed.js';

const BASE_URL = 'http://localhost:5000/api/v1';

export const runDoctorListingTests = async () => {
  console.log('\n==================================================');
  console.log('🩺 DOCTOR LISTING & POPULATE RECOVERY VERIFICATION');
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

  // 1. Ensure active doctor exists
  const activeDocUser = await User.create({
    name: 'Dr. Active Test Physician',
    email: `active.doc.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'doctor',
  });

  const activeDocProfile = await DoctorProfile.create({
    userId: activeDocUser._id,
    specialty: 'Cardiology',
    consultationFee: 1200,
    isAcceptingAppointments: true,
  });

  // 2. Create doctor profile with string userId to test populate recovery fallback
  const stringDocUser = await User.create({
    name: 'Dr. String ID Physician',
    email: `string.doc.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'doctor',
  });

  // Force store string ID on profile
  const stringDocProfile = await DoctorProfile.create({
    userId: stringDocUser._id.toString(),
    specialty: 'Dermatology',
    consultationFee: 1500,
    isAcceptingAppointments: true,
  });

  // 3. Test GET /api/v1/doctors
  try {
    const res = await fetch(`${BASE_URL}/doctors`);
    const data = await res.json();

    assert('GET /api/v1/doctors returns 200 OK', res.status === 200);
    assert('Response success is true', data.success === true);
    assert('Returns non-empty doctors array', Array.isArray(data.data?.doctors) && data.data.doctors.length > 0);

    const doctors = data.data?.doctors || [];

    // Verify activeDocProfile is in list
    const foundActive = doctors.find((d) => String(d.userId?._id) === String(activeDocUser._id));
    assert('Doctor with isAcceptingAppointments: true appears in response', Boolean(foundActive));
    assert('Doctor has populated userId with name', foundActive?.userId?.name === activeDocUser.name);

    // Verify string ID doctor recovered via fallback
    const foundString = doctors.find((d) => String(d.userId?._id) === String(stringDocUser._id));
    assert('Doctor with string/unpopulated userId recovered via fallback lookup', Boolean(foundString));
    assert('String ID Doctor has populated userId name', foundString?.userId?.name === stringDocUser.name);

  } catch (err) {
    assert('GET /api/v1/doctors test', false, err.message);
  }

  // 4. Test specialty filtering
  try {
    const res = await fetch(`${BASE_URL}/doctors?specialty=Cardiology`);
    const data = await res.json();

    assert('GET /api/v1/doctors?specialty=Cardiology returns 200 OK', res.status === 200);
    const doctors = data.data?.doctors || [];
    assert('Filtered list contains Cardiology doctor', doctors.some((d) => d.specialty === 'Cardiology'));
  } catch (err) {
    assert('Specialty filter test', false, err.message);
  }

  // Cleanup
  await DoctorProfile.findByIdAndDelete(activeDocProfile._id);
  await User.findByIdAndDelete(activeDocUser._id);
  await DoctorProfile.findByIdAndDelete(stringDocProfile._id);
  await User.findByIdAndDelete(stringDocUser._id);

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testDoctorListing.js')) {
  runDoctorListingTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
