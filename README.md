# VibeHealth 🩺

A modern, fault-tolerant healthcare appointment and follow-up management platform supporting **Patient**, **Doctor**, and **Admin** portals with AI-assisted clinical triage and asynchronous background task processing.

---

## 🌟 Key Architecture & Features

- **Portals:** Dedicated workflows for Patients (appointment booking, triage, follow-up viewing), Doctors (calendar management, pre-visit triage review, post-visit documentation), and Admins (system metrics, user management).
- **Slot Concurrency Protection:** Redis (`ioredis`) short-lived holds combined with MongoDB database-level compound unique indexes `(doctorId, startTime)` on active appointments.
- **Asynchronous Background Processing:** BullMQ-driven background workers (in-process for free-tier hosting) handling transactional emails, Google Calendar synchronization, and Google Gemini AI clinical triage summaries.
- **Fault-Tolerant Integrations:** Core booking and cancellation actions succeed independently of third-party API availability.
- **Clinical AI Safety & Human-in-the-Loop Architecture:**
  - **Pre-Visit Triage:** Strictly labeled *Clinician-Reference Triage Assistance*. Validated against strict Zod schemas before persistence.
  - **Post-Visit Summary Human-in-the-Loop Gate:** All AI-generated patient summaries are generated in draft state (`patientSummaryStatus = 'pending' -> 'completed'`). Nothing is visible on the patient portal or sent via email until the attending physician explicitly reviews, edits, and clicks **"Approve & Release to Patient"** (`doctorApproved = true`).
  - **Strict No-Hallucination Prompting:** The LLM prompt explicitly restricts output to rephrasing clinical notes provided by the doctor—strictly forbidding addition of external diagnoses, advice, or unlisted medications.
  - **Non-Blocking AI Failures:** If Gemini API or worker retries fail (`patientSummaryStatus = 'failed'`), the appointment record remains active (`confirmed`/`completed`). The doctor can write or edit the patient summary manually and approve it without LLM dependency.

---


## 🛠️ Technology Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose), Redis (`ioredis`), BullMQ, JWT, `bcrypt`, Zod.
- **Frontend:** React, Vite, Tailwind CSS, React Router, Axios, Lucide Icons.
- **AI / LLM:** Google Gemini API (`gemini-2.5-flash`).
- **Integrations:** Google Calendar API v3 (OAuth 2.0), Nodemailer (SMTP).

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+ or v20+)
- [MongoDB](https://www.mongodb.com/) (local daemon or MongoDB Atlas)
- [Redis](https://redis.io/) (local daemon or cloud Redis)

### 2. Environment Configuration
Copy the sample environment file to `.env` in the root and `/server`:
```bash
cp .env.example server/.env
```
Fill in your credentials for MongoDB, Redis, JWT Secret, and Google Gemini API.

### 3. Server Setup & Run
```bash
cd server
npm install
npm run dev
```

### 4. Client Setup & Run
```bash
cd client
npm install
npm run dev
```

### 5. Health Check
Verify backend connectivity and database status:
```bash
GET http://localhost:5000/api/v1/health
```
