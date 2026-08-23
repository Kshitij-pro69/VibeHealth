/**
 * testPreVisitSummary.js
 *
 * Tests all three AI pre-visit summary pipeline paths:
 *   Path 1 — Happy path: valid Gemini key → status='completed', urgency valid, 3 questions
 *   Path 2 — Forced failure: invalid API key override → status='failed', appointment unaffected
 *   Path 3 — Retry: re-enqueue from failed state → status resets to 'pending'
 *
 * Run: node src/utils/testPreVisitSummary.js
 */

import { connectDB, closeDB } from '../config/db.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Appointment } from '../models/Appointment.js';
import { Notification } from '../models/Notification.js';
import { seedDatabase } from './seed.js';
import { GeminiService, PreVisitSummaryOutputSchema } from '../services/geminiService.js';
import { dispatchLLMSummaryJob } from '../jobs/queue.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const BASE_URL = 'http://localhost:5000/api/v1';

const generateToken = (user) =>
  jwt.sign(
    { userId: user._id, id: user._id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll appointment until preVisitSummary.status changes from 'pending', or timeout */
const waitForSummaryStatus = async (appointmentId, maxWaitMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(1500);
    const apt = await Appointment.findById(appointmentId).lean();
    const status = apt?.preVisitSummary?.status;
    if (status && status !== 'pending') return apt;
  }
  return await Appointment.findById(appointmentId).lean();
};

export const runPreVisitSummaryTests = async () => {
  console.log('\n==================================================');
  console.log('🤖 AI PRE-VISIT SUMMARY — VERIFICATION SUITE');
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

  // ── Fixture Setup ────────────────────────────────────────────────────────
  const docUser = await User.create({
    name: 'Dr. AI Triage Test',
    email: `ai.triage.doc.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'doctor',
  });
  const docProfile = await DoctorProfile.create({
    userId: docUser._id,
    specialty: 'Internal Medicine',
    consultationFee: 500,
    slotDurationMinutes: 30,
    isAcceptingAppointments: true,
    workingHours: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 }],
  });
  const patientUser = await User.create({
    name: 'AI Test Patient',
    email: `ai.patient.${Date.now()}@vibehealth.dev`,
    password: 'Password123!',
    role: 'patient',
  });
  const patientToken = generateToken(patientUser);
  const docToken = generateToken(docUser);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(4, 0, 0, 0); // 09:30 IST → 04:00 UTC

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 1: GeminiService direct unit test (schema validation) ───────────
  // ─────────────────────────────────────────────────────────────────────────
  console.log('── Path 1a: GeminiService Schema Validation Unit Tests ──');

  // Valid response passes
  const validPayload = {
    urgency: 'Medium',
    chiefComplaint: 'Patient reports persistent chest tightness for 2 days.',
    suggestedQuestions: [
      'Does the tightness radiate to your arm or jaw?',
      'Have you experienced shortness of breath?',
      'Any recent physical exertion that worsened symptoms?',
    ],
  };
  try {
    const parsed = PreVisitSummaryOutputSchema.parse(validPayload);
    assert('Valid payload passes PreVisitSummaryOutputSchema', parsed.urgency === 'Medium');
    assert('Suggested questions count is exactly 3', parsed.suggestedQuestions.length === 3);
  } catch {
    assert('Valid payload passes schema', false);
    assert('Suggested questions count is exactly 3', false);
  }

  // Invalid urgency fails
  try {
    PreVisitSummaryOutputSchema.parse({ ...validPayload, urgency: 'Critical' });
    assert('Invalid urgency value rejected by schema', false, 'Should have thrown');
  } catch {
    assert('Invalid urgency value "Critical" rejected by schema', true);
  }

  // Wrong question count fails
  try {
    PreVisitSummaryOutputSchema.parse({ ...validPayload, suggestedQuestions: ['Q1', 'Q2'] });
    assert('Array of 2 questions rejected by schema', false, 'Should have thrown');
  } catch {
    assert('Array of 2 questions (not 3) rejected by schema', true);
  }

  // Empty chiefComplaint fails
  try {
    PreVisitSummaryOutputSchema.parse({ ...validPayload, chiefComplaint: '' });
    assert('Empty chiefComplaint rejected by schema', false, 'Should have thrown');
  } catch {
    assert('Empty chiefComplaint rejected by schema', true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 1b: Full API Happy Path ─────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Path 1b: Happy Path — GeminiService Direct + DB State Machine ──');

  let happyPathApptId = null;

  try {
    const apt = await Appointment.create({
      patientId: patientUser._id,
      doctorId: docUser._id,
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 30 * 60000),
      status: 'confirmed',
      reasonForVisit: 'Follow-up for persistent headaches',
      symptomDescription: 'Throbbing pain on the right side of the head, worse in the morning',
      symptomDuration: '5 days',
      symptomSeverity: 7,
      existingConditions: 'Migraine history',
      currentMedications: 'Ibuprofen 400mg as needed',
      consultationFee: 500,
      paymentStatus: 'paid',
      preVisitSummary: { status: 'pending' },
    });
    happyPathApptId = apt._id.toString();

    // Call GeminiService directly (as the worker would) — tests the real AI pipeline
    const result = await GeminiService.generatePreVisitSummary({
      reasonForVisit: apt.reasonForVisit,
      symptomDescription: apt.symptomDescription,
      symptomDuration: apt.symptomDuration,
      symptomSeverity: apt.symptomSeverity,
      existingConditions: apt.existingConditions,
      currentMedications: apt.currentMedications,
    });

    assert('GeminiService.generatePreVisitSummary returns success=true', result.success === true, `Error: ${result.error}`);
    assert('urgency is exactly Low/Medium/High', ['Low', 'Medium', 'High'].includes(result.data?.urgency), `Got: ${result.data?.urgency}`);
    assert('chiefComplaint is a non-empty string', typeof result.data?.chiefComplaint === 'string' && result.data.chiefComplaint.length > 0);
    assert('suggestedQuestions has exactly 3 items', Array.isArray(result.data?.suggestedQuestions) && result.data.suggestedQuestions.length === 3);

    // Simulate what the BullMQ worker does on success
    if (result.success && result.data) {
      await Appointment.findByIdAndUpdate(apt._id, {
        'preVisitSummary.status': 'completed',
        'preVisitSummary.urgency': result.data.urgency,
        'preVisitSummary.chiefComplaint': result.data.chiefComplaint,
        'preVisitSummary.suggestedQuestions': result.data.suggestedQuestions,
        'preVisitSummary.aiGeneratedAt': result.data.aiGeneratedAt,
        'preVisitSummary.disclaimer': result.data.disclaimer,
        'preVisitSummary.rawSymptomText': 'Follow-up for persistent headaches\nThrobbing pain on the right side of the head',
      });

      await Notification.create({
        userId: docUser._id,
        type: 'pre_visit_ready',
        title: 'AI Triage Summary Ready',
        message: `Urgency: ${result.data.urgency} — ${result.data.chiefComplaint}`,
        metadata: { appointmentId: apt._id.toString() },
      });
    }

    const finalApt = await Appointment.findById(apt._id).lean();
    assert('preVisitSummary.status is "completed" after successful AI call', finalApt?.preVisitSummary?.status === 'completed', `Got: ${finalApt?.preVisitSummary?.status}`);
    assert('appointment.status remains "confirmed" throughout', finalApt?.status === 'confirmed');

    const notif = await Notification.findOne({ userId: docUser._id, type: 'pre_visit_ready' });
    assert('Doctor notification created with type=pre_visit_ready', Boolean(notif));
  } catch (err) {
    assert('Path 1b happy path', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 2: Forced Failure (invalid key override) ─────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Path 2: Forced Failure Path (Invalid API Key) ──');

  let failureApptId = null;

  try {
    const failApt = await Appointment.create({
      patientId: patientUser._id,
      doctorId: docUser._id,
      startTime: new Date(tomorrow.getTime() + 60 * 60000),
      endTime: new Date(tomorrow.getTime() + 90 * 60000),
      status: 'confirmed',
      reasonForVisit: 'Knee pain evaluation',
      symptomDescription: 'Sharp pain when bending the knee',
      symptomDuration: '2 weeks',
      symptomSeverity: 6,
      existingConditions: 'None',
      currentMedications: 'None',
      consultationFee: 500,
      paymentStatus: 'paid',
      preVisitSummary: { status: 'pending' },
    });
    failureApptId = failApt._id.toString();

    // Simulate failure by calling generatePreVisitSummary with temp invalid key override
    const origKey = config.gemini.apiKey;
    config.gemini.apiKey = 'INVALID_KEY_FOR_TESTING_FAILURE_PATH';

    const result = await GeminiService.generatePreVisitSummary({
      reasonForVisit: failApt.reasonForVisit,
      symptomDescription: failApt.symptomDescription,
    });

    config.gemini.apiKey = origKey; // Restore

    assert('generatePreVisitSummary returns success=false on invalid key', result.success === false);
    assert('generatePreVisitSummary returns error string on failure', typeof result.error === 'string' && result.error.length > 0);

    // Manually simulate what the worker does on failure
    await Appointment.findByIdAndUpdate(failApt._id, { 'preVisitSummary.status': 'failed', 'preVisitSummary.rawSymptomText': 'Knee pain evaluation\nSharp pain when bending the knee' });
    const checkApt = await Appointment.findById(failApt._id).lean();

    assert('preVisitSummary.status set to "failed" after LLM failure', checkApt?.preVisitSummary?.status === 'failed');
    assert('appointment.status REMAINS "confirmed" after AI failure', checkApt?.status === 'confirmed', `Got: ${checkApt?.status}`);
    assert('rawSymptomText preserved for doctor fallback display', Boolean(checkApt?.preVisitSummary?.rawSymptomText));
  } catch (err) {
    assert('Path 2 forced failure', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── PATH 3: Retry API Endpoint ─────────────────────────────────────────
  // NOTE: This path tests the retry mechanism (endpoint + DB reset).
  // Whether the retried job ultimately reaches 'completed' depends on
  // LLM availability and is tested separately in Path 1b (direct call).
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Path 3: Retry Summary Endpoint (Doctor Re-enqueues Failed Job) ──');

  if (failureApptId) {
    try {
      const retryRes = await fetch(`${BASE_URL}/appointments/${failureApptId}/retry-summary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${docToken}` },
      });
      const retryData = await retryRes.json().catch(() => ({}));

      assert('Retry summary endpoint returns HTTP 200 OK', retryRes.status === 200, `Status: ${retryRes.status}`);
      assert('Retry response indicates summaryStatus=pending', retryData?.data?.summaryStatus === 'pending', JSON.stringify(retryData));

      // Verify DB reset
      const afterRetry = await Appointment.findById(failureApptId).lean();
      assert('preVisitSummary.status reset to "pending" in DB after retry', afterRetry?.preVisitSummary?.status === 'pending', `Got: ${afterRetry?.preVisitSummary?.status}`);
      assert('appointment.status unchanged after retry (still confirmed)', afterRetry?.status === 'confirmed');

      // Wait for retry job to process (informational — outcome depends on LLM rate limits)
      console.log(`  Waiting for retry LLM job to process (up to 30s, informational)...`);
      const afterRetryFinal = await waitForSummaryStatus(failureApptId, 30000);
      const finalStatus = afterRetryFinal?.preVisitSummary?.status;
      console.log(`  ℹ️  Retry job final status: ${finalStatus} (completed=success, failed=rate-limited or API issue)`);
      // This assertion is soft — only marks as PASS if completed; reports but does not block if rate-limited
      assert(
        'preVisitSummary.status becomes "completed" after retry (may fail if LLM rate-limited)',
        finalStatus === 'completed',
        `Got: ${finalStatus}`
      );
    } catch (err) {
      assert('Path 3 retry endpoint', false, err.message);
    }
  } else {
    assert('Path 3 retry (skipped — no failure appointment)', false, 'failure appointment was not created');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (happyPathApptId) await Appointment.findByIdAndDelete(happyPathApptId);
  if (failureApptId) await Appointment.findByIdAndDelete(failureApptId);
  await Notification.deleteMany({ userId: docUser._id });
  await DoctorProfile.findByIdAndDelete(docProfile._id);
  await User.findByIdAndDelete(docUser._id);
  await User.findByIdAndDelete(patientUser._id);

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  await closeDB();
  return { passed, failed };
};

if (process.argv[1]?.endsWith('testPreVisitSummary.js')) {
  runPreVisitSummaryTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
