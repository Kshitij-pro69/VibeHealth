import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Schema for structured pre-visit summary
export const PreVisitSummarySchema = z.object({
  symptoms: z.array(z.string()).default([]),
  severity: z.enum(['low', 'moderate', 'high', 'emergency', 'unknown']).default('unknown'),
  triageNotes: z.string().default(''),
  suggestedQuestions: z.array(z.string()).default([]),
});

// Schema for structured post-visit clinical summary suggestion
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

  /**
   * Generates a pre-visit clinical triage assistance summary from patient notes.
   * STRICTLY LABELED AS CLINICIAN-REFERENCE TRIAGE ASSISTANCE.
   */
  static async generatePreVisitSummary(reasonForVisit, patientNotes = '', timeoutMs = 8000) {
    if (!config.gemini.apiKey) {
      logger.warn('Gemini API key not configured, skipping AI triage generation');
      return {
        success: false,
        error: 'Gemini API key is not configured',
        data: null,
      };
    }

    try {
      const ai = this._getClient();
      const prompt = `You are a clinical triage assistant for a healthcare provider.
Analyze the following patient pre-visit intake information and produce a structured JSON triage summary for the attending doctor.

CRITICAL SAFETY RULES:
- Output MUST be valid JSON only matching the schema:
  {
    "symptoms": ["string"],
    "severity": "low" | "moderate" | "high" | "emergency" | "unknown",
    "triageNotes": "string",
    "suggestedQuestions": ["string"]
  }
- Do NOT provide direct medical advice to patients.
- Focus exclusively on objective triage assistance for the clinician.

Patient Reason for Visit: ${reasonForVisit}
Additional Patient Notes: ${patientNotes || 'None provided'}`;

      // Promise with strict timeout
      const responsePromise = ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out')), timeoutMs)
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);
      const rawText = response.text;

      // Parse JSON
      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (jsonErr) {
        logger.error('Gemini returned non-JSON output:', { rawText });
        return {
          success: false,
          error: 'LLM response was not valid JSON',
          data: null,
        };
      }

      // Schema validation via Zod
      const validatedData = PreVisitSummarySchema.parse(parsedJson);

      return {
        success: true,
        data: {
          ...validatedData,
          disclaimer: 'Clinician-Reference Triage Assistance only. Not authoritative medical advice.',
          aiGeneratedAt: new Date(),
        },
      };
    } catch (err) {
      logger.error('Error in GeminiService.generatePreVisitSummary:', { error: err.message });
      return {
        success: false,
        error: err.message,
        data: null,
      };
    }
  }

  /**
   * Generates a structured post-visit summary template from raw doctor encounter notes.
   */
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
