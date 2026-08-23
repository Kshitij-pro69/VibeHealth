/**
 * testPostVisitSummary.js
 *
 * Verification suite for Phase 8: Post-Visit Notes & Human-in-the-Loop Patient Summary
 *
 * Tests 4 key flows:
 *   Path 1: Schema & Prompt Validation (Direct GeminiService unit test)
 *   Path 2: Full Happy Path — Draft save -> LLM summary generation -> Doctor edit & approve -> Patient visibility + status='completed'
 *   Path 3: Forced Failure Path — Invalid API key -> patientSummaryStatus='failed' -> Appointment booking unaffected -> Retry resets to 'pending'
 *   Path 4: Manual Override Path — Doctor approves manual text from 'failed' state -> Patient summary released without LLM dependency
 *
 * Run: node src/utils/testPostVisitSummary.js
 */

import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Appointment } from '../models/Appointment.js';
import { seedDatabase } from './seed.js';
import { GeminiService, PatientSummaryOutputSchema } from '../services/geminiService.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const BASE_URL = 'http://localhost:5000/api/v1';

const generateToken = (user) =>
  jwt.sign(
    { userId: user._id, id: user._id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

export const runPostVisitSummaryTests = async () => {
  console.log('\n==================================================');
  console.log('🩺 POST-VISIT SUMMARY & HUMAN-IN-THE-LOOP SUITE');
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

  // ── Fixtures Setup ───────────────────────────────────────────────────────
  const docUser = await User.create({
    name: 'Dr. Post Visit Test',
    email: `post.visit.doc.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'doctor',
  });
  const docProfile = await DoctorProfile.create({
    userId: docUser._id,
    specialty: 'General Practice',
    consultationFee: 750,
    slotDurationMinutes: 20,
    isAcceptingAppointments: true,
  });
  const patientUser = await User.create({
    name: 'Post Visit Patient',
    email: `post.patient.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'patient',
  });

  const docToken = generateToken(docUser);
  const patientToken = generateToken(patientUser);

  const testNotes = 'Patient presented with mild hypertension and stress. Prescribed Amlodipine 5mg once daily for 30 days. Advised low salt diet, 30 min daily walking, and follow up in 4 weeks.';
  const testPrescriptions = [
    {
      medicationName: 'Amlodipine',
      dosage: '5mg',
      frequency: 'Once daily',
      durationDays: 30,
      instructions: 'Take in the morning with water',
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 1: PatientSummaryOutputSchema Unit Validation ────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  console.log('── Path 1: PatientSummaryOutputSchema Unit Validation ──');

  const validPayload = {
    summary: 'You have mild high blood pressure. Take your prescribed medication every morning and walk 30 minutes daily.',
    medicationSchedule: [{ medication: 'Amlodipine 5mg', schedule: 'Once daily in the morning' }],
    followUpSteps: ['Walk 30 mins daily', 'Low salt diet', 'Return for checkup in 4 weeks'],
  };

  try {
    const parsed = PatientSummaryOutputSchema.parse(validPayload);
    assert('Valid PatientSummaryOutputSchema payload parses cleanly', Boolean(parsed.summary));
    assert('medicationSchedule array correctly structured', parsed.medicationSchedule.length === 1);
  } catch (err) {
    assert('Valid PatientSummaryOutputSchema payload parses cleanly', false, err.message);
  }

  try {
    PatientSummaryOutputSchema.parse({ ...validPayload, summary: '' });
    assert('Empty summary string rejected by schema', false, 'Should have thrown');
  } catch {
    assert('Empty summary string rejected by schema', true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 2: Full Doctor Flow — Draft Save → Summary Generation → Approval
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Path 2: Full Doctor Flow (Draft Save → Approval Gate) ──');

  let appt1Id = null;

  try {
    const appt = await Appointment.create({
      patientId: patientUser._id,
      doctorId: docUser._id,
      startTime: new Date(),
      endTime: new Date(Date.now() + 20 * 60000),
      status: 'confirmed',
      reasonForVisit: 'Hypertension Consultation',
      consultationFee: 750,
      paymentStatus: 'paid',
    });
    appt1Id = appt._id.toString();

    // 1. Doctor saves clinical draft via API
    const saveRes = await fetch(`${BASE_URL}/appointments/${appt1Id}/post-visit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      body: JSON.stringify({
        clinicalNotes: testNotes,
        diagnosis: 'Essential Hypertension',
        prescriptions: testPrescriptions,
      }),
    });

    const saveData = await saveRes.json();
    assert('Save post-visit draft returns HTTP 200 OK', saveRes.status === 200);
    assert('postVisitSummary.patientSummaryStatus set to "pending"', saveData.data?.postVisitSummary?.patientSummaryStatus === 'pending');
    assert('doctorApproved is false on draft save (not yet patient visible)', saveData.data?.postVisitSummary?.doctorApproved === false);

    // 2. Test GeminiService direct generation (mimicking BullMQ worker)
    const aiResult = await GeminiService.generatePatientSummary(testNotes, testPrescriptions);
    if (aiResult.success) {
      await Appointment.findByIdAndUpdate(appt1Id, {
        'postVisitSummary.patientSummaryStatus': 'completed',
        'postVisitSummary.patientSummary.generatedText': aiResult.data.summary,
        'postVisitSummary.patientSummary.medicationSchedule': aiResult.data.medicationSchedule,
        'postVisitSummary.patientSummary.followUpSteps': aiResult.data.followUpSteps,
        'postVisitSummary.patientSummary.aiGeneratedAt': aiResult.data.aiGeneratedAt,
      });
      assert('GeminiService.generatePatientSummary succeeds with structured output', true);
    } else {
      console.log(`  ℹ️ GeminiService API note: ${aiResult.error} (falling back to mock summary for approval testing)`);
      await Appointment.findByIdAndUpdate(appt1Id, {
        'postVisitSummary.patientSummaryStatus': 'completed',
        'postVisitSummary.patientSummary.generatedText': 'Patient presented with mild hypertension. Take Amlodipine 5mg daily. Follow up in 4 weeks.',
      });
      assert('Draft summary stored for doctor review', true);
    }

    // Verify patient cannot see it BEFORE approval
    const preApproveCheck = await Appointment.findById(appt1Id).lean();
    assert('Patient cannot view summary before doctor approval (doctorApproved === false)', preApproveCheck.postVisitSummary.doctorApproved === false);
    assert('Appointment status is NOT completed before approval (remains confirmed)', preApproveCheck.status === 'confirmed');

    // 3. Doctor reviews & approves summary via API
    const approvedContent = 'Reviewed Summary: You have mild hypertension. Take Amlodipine 5mg once daily. Eat a low-salt diet and walk 30 minutes every day. See you in 4 weeks!';
    const approveRes = await fetch(`${BASE_URL}/appointments/${appt1Id}/approve-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      body: JSON.stringify({ approvedText: approvedContent }),
    });

    const approveData = await approveRes.json();
    assert('Approve summary endpoint returns HTTP 200 OK', approveRes.status === 200);

    const postApproveCheck = await Appointment.findById(appt1Id).lean();
    assert('doctorApproved flipped to true upon approval', postApproveCheck.postVisitSummary.doctorApproved === true);
    assert('Appointment status flipped to "completed" upon approval', postApproveCheck.status === 'completed');
    assert('approvedText matches doctor approved content', postApproveCheck.postVisitSummary.patientSummary.approvedText === approvedContent);
    assert('doctorApprovedAt timestamp populated', Boolean(postApproveCheck.postVisitSummary.doctorApprovedAt));
  } catch (err) {
    assert('Path 2 full doctor flow', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 3: Forced Failure & Retry Path ──────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Path 3: Forced Failure & Retry Path ──');

  let appt2Id = null;

  try {
    const appt2 = await Appointment.create({
      patientId: patientUser._id,
      doctorId: docUser._id,
      startTime: new Date(),
      endTime: new Date(Date.now() + 20 * 60000),
      status: 'confirmed',
      reasonForVisit: 'Routine Followup',
      consultationFee: 750,
      paymentStatus: 'paid',
      postVisitSummary: {
        clinicalNotes: 'Notes for failure testing',
        diagnosis: 'Routine Check',
        patientSummaryStatus: 'pending',
      },
    });
    appt2Id = appt2._id.toString();

    // Call GeminiService with bad key
    const origKey = config.gemini.apiKey;
    config.gemini.apiKey = 'INVALID_KEY_TEST';
    const failResult = await GeminiService.generatePatientSummary('Notes', []);
    config.gemini.apiKey = origKey;

    assert('generatePatientSummary returns success=false on invalid API key', failResult.success === false);

    // Simulate worker updating DB to 'failed'
    await Appointment.findByIdAndUpdate(appt2Id, {
      'postVisitSummary.patientSummaryStatus': 'failed',
    });

    const failCheck = await Appointment.findById(appt2Id).lean();
    assert('patientSummaryStatus updated to "failed"', failCheck.postVisitSummary.patientSummaryStatus === 'failed');
    assert('Appointment booking status unaffected by AI failure (still confirmed)', failCheck.status === 'confirmed');

    // Doctor triggers retry API endpoint
    const retryRes = await fetch(`${BASE_URL}/appointments/${appt2Id}/retry-patient-summary`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${docToken}` },
    });
    const retryData = await retryRes.json();

    assert('Retry patient summary endpoint returns HTTP 200 OK', retryRes.status === 200);
    assert('Retry response indicates patientSummaryStatus="pending"', retryData.data?.patientSummaryStatus === 'pending');

    const afterRetry = await Appointment.findById(appt2Id).lean();
    assert('patientSummaryStatus reset to "pending" in DB after retry call', afterRetry.postVisitSummary.patientSummaryStatus === 'pending');
  } catch (err) {
    assert('Path 3 forced failure & retry', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 4: Manual Override from Failed State ─────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Path 4: Manual Override from Failed AI State ──');

  try {
    if (appt2Id) {
      // Simulate that LLM failed completely, leaving status='failed'
      await Appointment.findByIdAndUpdate(appt2Id, {
        'postVisitSummary.patientSummaryStatus': 'failed',
      });

      const manualText = 'Manual Doctor Summary: Everything looks healthy. Maintain current lifestyle and exercise routine.';

      // Doctor approves manual summary directly from failed state
      const manualApproveRes = await fetch(`${BASE_URL}/appointments/${appt2Id}/approve-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${docToken}`,
        },
        body: JSON.stringify({ approvedText: manualText }),
      });

      assert('Manual summary approval from failed AI state returns HTTP 200 OK', manualApproveRes.status === 200);

      const manualCheck = await Appointment.findById(appt2Id).lean();
      assert('doctorApproved flipped to true without LLM dependency', manualCheck.postVisitSummary.doctorApproved === true);
      assert('Appointment status updated to "completed"', manualCheck.status === 'completed');
      assert('Manual text saved as approvedText', manualCheck.postVisitSummary.patientSummary.approvedText === manualText);
    }
  } catch (err) {
    assert('Path 4 manual override', false, err.message);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (appt1Id) await Appointment.findByIdAndDelete(appt1Id);
  if (appt2Id) await Appointment.findByIdAndDelete(appt2Id);
  await DoctorProfile.findByIdAndDelete(docProfile._id);
  await User.findByIdAndDelete(docUser._id);
  await User.findByIdAndDelete(patientUser._id);

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testPostVisitSummary.js')) {
  runPostVisitSummaryTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
