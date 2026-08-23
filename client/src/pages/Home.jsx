import React from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse, Calendar, Stethoscope, ShieldCheck, Sparkles, Zap, Clock, ArrowRight } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';

export const Home = () => {
  return (
    <div className="space-y-16 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>Next-Gen Healthcare Management & AI Triage</span>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
          Intelligent care workflows, <br />
          <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-600 bg-clip-text text-transparent">
            zero booking friction.
          </span>
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed">
          Experience guaranteed conflict-free scheduling, AI clinical triage assistance for physicians, and
          automatic calendar and reminder synchronization.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link to="/register">
            <Button size="lg" className="shadow-lg shadow-teal-500/25">
              Book a Consultation
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="lg">
              Physician & Staff Portal
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card hoverable className="space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100/80 text-teal-700 flex items-center justify-center">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Conflict-Proof Holds</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Redis-powered 5-minute atomic holds backed by compound partial database indexes guarantee no double bookings.
          </p>
        </Card>

        <Card hoverable className="space-y-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-100/80 text-cyan-700 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">AI Triage Assistance</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Gemini structured outputs synthesize patient pre-visit symptoms into actionable clinician-reference notes.
          </p>
        </Card>

        <Card hoverable className="space-y-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Fault-Tolerant Async Queues</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            BullMQ workers with exponential backoff handle emails, Google Calendar events, and background reminders.
          </p>
        </Card>
      </section>

      {/* Portal Roles Section */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-850 rounded-3xl p-8 sm:p-12 text-white shadow-xl shadow-slate-900/10">
        <div className="max-w-2xl mb-8 space-y-2">
          <Badge variant="primary" className="bg-teal-500/20 text-teal-300 border-teal-500/30">
            Multi-Role Architecture
          </Badge>
          <h2 className="text-3xl font-bold">Tailored Portals for Every Role</h2>
          <p className="text-slate-400 text-sm">
            Strict role-based access control and resource ownership checks protect confidential medical records.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glassmorphism-dark p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3 text-teal-400 font-semibold">
              <Calendar className="w-5 h-5" />
              <h4>Patient Portal</h4>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Find specialists, choose open slots with instant holds, submit intake symptoms, and view approved summaries.
            </p>
          </div>

          <div className="glassmorphism-dark p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3 text-cyan-400 font-semibold">
              <Stethoscope className="w-5 h-5" />
              <h4>Doctor Portal</h4>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Review AI triage briefs before appointments, manage weekly schedules & leaves, and edit post-visit clinical notes.
            </p>
          </div>

          <div className="glassmorphism-dark p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3 text-purple-400 font-semibold">
              <ShieldCheck className="w-5 h-5" />
              <h4>Admin Portal</h4>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Monitor system health probes, Redis queue job metrics, doctor approvals, and platform compliance.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
