# VibeHealth — Project Rules & Architecture Guidelines

## 1. Overview & System Architecture
**VibeHealth** is a healthcare appointment and follow-up management platform supporting **Patient**, **Doctor**, and **Admin** portals.

### Repository Structure
- `/server` — Node.js + Express backend API, database models, background workers, and external integrations.
- `/client` — React + Vite + Tailwind CSS frontend single-page application.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Backend Framework** | Node.js, Express |
| **Database & ODM** | MongoDB with Mongoose |
| **Caching & Slot Holds** | Redis (`ioredis`) |
| **Background Queue & Jobs** | BullMQ (Redis-backed) |
| **Authentication & Security** | JWT (JSON Web Tokens), `bcrypt`, RBAC + Ownership middleware |
| **Input Validation** | Zod (or Joi) |
| **Frontend Framework & UI** | React, Vite, Tailwind CSS |
| **AI / LLM Integration** | Google Gemini API |
| **External Integrations** | Google Calendar API v3 (OAuth 2.0), Nodemailer (SMTP) |

---

## 3. Non-Negotiable Core Rules & Conventions

### 3.1. Fault Tolerance & Non-Blocking External Services
- **Core actions must NEVER depend synchronously on external APIs.**
  - Booking, updating, or cancelling an appointment must succeed immediately even if Google Calendar is down, the LLM is unresponsive, or the email server fails.
- **External side effects (LLM summary generation, Google Calendar event synchronization, transactional emails, medication reminders) MUST be delegated to BullMQ background jobs.**
  - Never make inline, blocking external service calls inside HTTP request handlers/controllers.

### 3.2. Dedicated Service Layer (`/server/services`)
- Every third-party integration (Google Gemini, Google Calendar, Nodemailer) must reside in its own dedicated module under `/server/services/`.
- Every service method must implement:
  - Strict timeout handling.
  - Granular `try/catch` error encapsulation.
  - Predictable, typed success/failure response objects.
- **Controllers must NEVER invoke raw external SDKs/APIs directly.**

### 3.3. Appointment Slot Concurrency & Conflict Prevention
- Temporary slot selection must use short-lived Redis holds (`ioredis`).
- Database-level conflict prevention is enforced with a **compound unique index** in MongoDB on `(doctorId, startTime)` for active/confirmed appointments.
- **Duplicate Key Handling:** Always intercept MongoDB duplicate-key error `E11000` and transform it into a clean `409 Conflict` HTTP response. It must never bubble up as a `500 Internal Server Error`.

### 3.4. Background Jobs & Scheduling (BullMQ)
- All asynchronous tasks (LLM summaries, email dispatches with retries, reminder notifications) must run via **BullMQ** queues with configured exponential backoff retries.
- **Zero in-memory scheduling:** Never use `setTimeout`, `setInterval`, or in-memory timers for background execution or scheduling.

### 3.5. AI / Gemini Integration & Clinical Safety
- **Strict Structured Output:** All Gemini prompts must request strict JSON and be schema-validated (e.g., via Zod) prior to database persistence. If the schema validation fails, treat the job as failed—never store unstructured or malformed output.
- **No Direct Medical Advice:** AI-generated outputs must never be presented as authoritative medical advice.
- **Pre-Visit Summaries:** Must be explicitly labeled as *Clinician-Reference Triage Assistance*.
- **Post-Visit Summaries:** Must be reviewable and editable by the attending doctor before being made visible to the patient.

### 3.6. Security, Authorization & Ownership Checks
- **Role-Based Access Control (RBAC):** Every private route must be guarded by authentication and role-checking middleware (`patient`, `doctor`, `admin`).
- **Resource Ownership Verification:** Role checks alone are insufficient. Route handlers and middleware must verify resource ownership (e.g., a patient can only read and modify their own appointments, records, and profile).
- **Request Body Validation:** Validate every incoming request payload using schema validation (Zod or Joi). Never trust or process unvalidated client input.

### 3.7. Configuration & Environment Management
- All secrets, API keys, credentials, and ports must be loaded from environment variables (`.env`).
- Maintain an up-to-date [`.env.example`](file:///c:/Users/ACER/Desktop/VibeHealth/.env.example) containing placeholder values for all required variables.
- [`.gitignore`](file:///c:/Users/ACER/Desktop/VibeHealth/.gitignore) must exclude `node_modules/`, `.env`, build output directories (`dist/`, `build/`), and IDE/editor configuration directories (`.vscode/`, `.idea/`).
