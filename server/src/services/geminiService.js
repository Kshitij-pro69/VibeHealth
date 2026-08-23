import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// OUTPUT SCHEMA — strict Zod validation applied to every Gemini response.
// Requirements from the brief:
//   - urgency: exactly 'Low' | 'Medium' | 'High'
//   - chiefComplaint: non-empty string
//   - suggestedQuestions: array of exactly 3 strings
// Any deviation throws → treated as job failure, not a partial save.
// ---------------------------------------------------------------------------
export const PreVisitSummaryOutputSchema = z.object({
  urgency: z.enum(['Low', 'Medium', 'High']),
  chiefComplaint: z.string().min(1, 'chiefComplaint must be a non-empty string'),
  suggestedQuestions: z
    .array(z.string())
    .length(3, 'suggestedQuestions must contain exactly 3 strings'),
});

// Legacy schema kept for post-visit summary (unchanged)
export const PostVisitSummarySchema = z.object({
  clinicalNotes: z.string().default(''),
  diagnosis: z.string().default(''),
  prescriptions: z
    .array(
      z.object({
        medicationName: z.string(),
        dosage: z.string(),
        frequency: z.string(),
        durationDays: z.number().optional().default(7),
        instructions: z.string().optional().default(''),
      })
    )
    .default([]),
});

export class GeminiService {
  static _getClient() {
    if (!config.gemini.apiKey) {
      return null;
    }
    return new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }

  // ---------------------------------------------------------------------------
  // PROVIDER-AGNOSTIC INTERFACE
  //
  // generateStructured(prompt, schema, timeoutMs) is the single method that
  // owns the HTTP call and JSON→Zod validation pipeline.
  // To swap providers (OpenAI, Anthropic, etc.), replace only this method.
  // All higher-level callers remain unchanged.
  // ---------------------------------------------------------------------------
  static async generateStructured(prompt, schema, timeoutMs = 20000) {
    const ai = this._getClient();
    if (!ai) {
      throw new Error('LLM provider API key is not configured');
    }

    const responsePromise = ai.models.generateContent({
      model: config.gemini.model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json', // Gemini enforces JSON output — no markdown fences possible
        temperature: 0.2,
      },
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM request timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const rawText = response.text; // .text is a getter property, not a method call

    // Parse JSON — any non-JSON response is an immediate failure
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error(`LLM returned non-JSON output: ${rawText?.slice(0, 200)}`);
    }

    // Schema validation — throws ZodError on mismatch, propagated as job failure
    return schema.parse(parsed);
  }

  // ---------------------------------------------------------------------------
  // PRE-VISIT TRIAGE SUMMARY
  //
  // Accepts the full structured patient symptom intake collected during the
  // hold window. Returns a validated { urgency, chiefComplaint, suggestedQuestions }
  // object or throws on any validation or network failure.
  //
  // SAFETY NOTICE:
  //   - Output is labeled "Clinician-Reference Triage Assistance"
  //   - Must NOT be presented to patients as a diagnosis
  //   - Urgency is based solely on reported symptoms, NOT a clinical assessment
  // ---------------------------------------------------------------------------
  static async generatePreVisitSummary(
    {
      reasonForVisit = '',
      symptomDescription = '',
      symptomDuration = '',
      symptomSeverity = null,
      existingConditions = '',
      currentMedications = '',
    },
    timeoutMs = 20000
  ) {
    try {
      // Build the prompt exactly as specified in the brief — no deviation
      const prompt = `You are assisting a clinician by triaging a patient's self-reported symptoms before a consultation. Return ONLY valid JSON with keys: urgency (exactly 'Low', 'Medium', or 'High'), chiefComplaint (one short sentence), suggestedQuestions (array of exactly 3 questions the doctor should ask). Do not diagnose. Do not recommend treatment. Base urgency only on the reported symptoms.
Reason for visit: ${reasonForVisit || 'Not specified'}
Symptoms: ${symptomDescription || 'Not specified'}
Duration: ${symptomDuration || 'Not specified'}
Severity: ${symptomSeverity != null ? `${symptomSeverity}/10` : 'Not specified'}
Existing conditions: ${existingConditions || 'None reported'}
Current medications: ${currentMedications || 'None reported'}`;

      const validated = await this.generateStructured(
        prompt,
        PreVisitSummaryOutputSchema,
        timeoutMs
      );

      return {
        success: true,
        data: {
          urgency: validated.urgency,
          chiefComplaint: validated.chiefComplaint,
          suggestedQuestions: validated.suggestedQuestions,
          aiGeneratedAt: new Date(),
          disclaimer:
            'Clinician-Reference Triage Assistance only. Not authoritative medical advice.',
        },
      };
    } catch (err) {
      logger.error('GeminiService.generatePreVisitSummary failed:', { error: err.message });
      return {
        success: false,
        error: err.message,
        data: null,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // POST-VISIT CLINICAL SUMMARY (unchanged from Phase 5)
  // ---------------------------------------------------------------------------
  static async formatPostVisitEncounter(rawDoctorNotes, timeoutMs = 8000) {
    if (!config.gemini.apiKey) {
      return { success: false, error: 'Gemini API key not configured', data: null };
    }

    try {
      const ai = this._getClient();
      const prompt = `You are a medical scribe assistant for a physician.
Format the doctor's raw consultation notes into structured JSON.

CRITICAL RULES:
- Output MUST be strictly valid JSON matching:
  {
    "clinicalNotes": "string",
    "diagnosis": "string",
    "prescriptions": [
      {
        "medicationName": "string",
        "dosage": "string",
        "frequency": "string",
        "durationDays": number,
        "instructions": "string"
      }
    ]
  }
- Never invent or fabricate medications not mentioned in the doctor's raw notes.

Doctor's Raw Notes:
${rawDoctorNotes}`;

      const responsePromise = ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out')), timeoutMs)
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);
      const rawText = response.text;
      const parsedJson = JSON.parse(rawText);
      const validatedData = PostVisitSummarySchema.parse(parsedJson);

      return {
        success: true,
        data: validatedData,
      };
    } catch (err) {
      logger.error('Error in GeminiService.formatPostVisitEncounter:', { error: err.message });
      return {
        success: false,
        error: err.message,
        data: null,
      };
    }
  }
}
