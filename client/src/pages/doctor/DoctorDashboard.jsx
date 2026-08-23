import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import {
  Calendar,
  Sparkles,
  FileText,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';

// Urgency badge colours: Low=emerald, Medium=amber, High=rose
const urgencyVariant = (urgency) => {
  if (urgency === 'High') return 'danger';
  if (urgency === 'Medium') return 'warning';
  return 'success';
};

export const DoctorDashboard = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [expandedIntake, setExpandedIntake] = useState({}); // { [aptId]: boolean }
  const [retryingIds, setRetryingIds] = useState({}); // { [aptId]: boolean }

  // Post-visit review form state
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [medication, setMedication] = useState({ name: '', dosage: '', frequency: 'Once daily', days: 7 });
  const [saveLoading, setSaveLoading] = useState(false);

  const fetchDoctorAppointments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/appointments/my');
      if (res.success) {
        setAppointments(res.data.appointments);
      }
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorAppointments();
    // Poll every 8 seconds to pick up completed/failed AI summaries
    const poll = setInterval(fetchDoctorAppointments, 8000);
    return () => clearInterval(poll);
  }, []);

  const openReviewModal = (apt) => {
    setActiveAppointment(apt);
    setClinicalNotes(apt.postVisitSummary?.clinicalNotes || '');
    setDiagnosis(apt.postVisitSummary?.diagnosis || '');
  };

  const handleRetryAISummary = async (apt) => {
    setRetryingIds((prev) => ({ ...prev, [apt._id]: true }));
    try {
      await api.post(`/appointments/${apt._id}/retry-summary`);
      // Optimistically update local state to pending
      setAppointments((prev) =>
        prev.map((a) =>
          a._id === apt._id
            ? { ...a, preVisitSummary: { ...a.preVisitSummary, status: 'pending' } }
            : a
        )
      );
    } catch (err) {
      console.error('Failed to retry AI summary:', err);
    } finally {
      setRetryingIds((prev) => ({ ...prev, [apt._id]: false }));
    }
  };

  const handleSavePostVisit = async (approve = false) => {
    if (!activeAppointment) return;
    setSaveLoading(true);

    try {
      const payload = {
        clinicalNotes,
        diagnosis,
        prescriptions: medication.name
          ? [
              {
                medicationName: medication.name,
                dosage: medication.dosage,
                frequency: medication.frequency,
                durationDays: Number(medication.days),
              },
            ]
          : [],
        doctorApproved: approve,
      };

      const res = await api.put(`/appointments/${activeAppointment._id}/post-visit`, payload);
      if (res.success) {
        setActiveAppointment(null);
        fetchDoctorAppointments();
      }
    } catch (err) {
      console.error('Error saving post visit notes:', err);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Physician Portal — Dr. {user?.name}</h1>
        <p className="text-sm text-slate-500">
          Review AI triage briefs, manage clinical encounters, and approve patient-facing summaries
        </p>
      </div>

      {/* Consultations List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Assigned Consultations</h2>

        {loading ? (
          <Spinner />
        ) : appointments.length === 0 ? (
          <Card className="text-center py-12 space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-800">No appointments scheduled today</p>
            <p className="text-xs text-slate-500">New patient bookings will appear here automatically.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {appointments.map((apt) => {
              const summaryStatus = apt.preVisitSummary?.status;
              const intakeExpanded = expandedIntake[apt._id] ?? false;
              const hasIntake = apt.symptomDescription || apt.existingConditions || apt.currentMedications;

              return (
                <Card key={apt._id} className="p-6 space-y-4">
                  {/* Patient header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm">
                        {apt.patientId?.name?.charAt(0) || 'P'}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">{apt.patientId?.name}</h4>
                        <p className="text-xs text-slate-500">{apt.patientId?.email} • {apt.patientId?.phone || 'No phone'}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={apt.status === 'confirmed' ? 'success' : 'default'}>{apt.status}</Badge>
                      <Button onClick={() => openReviewModal(apt)} variant="outline" size="sm">
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                        Document Encounter
                      </Button>
                    </div>
                  </div>

                  {/* Reason for visit */}
                  <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl">
                    <span className="font-semibold text-slate-800">Reason for visit: </span>
                    {apt.reasonForVisit || '—'}
                  </div>

                  {/* Collapsible structured patient intake */}
                  {hasIntake && (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedIntake((prev) => ({ ...prev, [apt._id]: !intakeExpanded }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                      >
                        <span>Patient Intake Details</span>
                        {intakeExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {intakeExpanded && (
                        <div className="px-3 py-2.5 space-y-1.5 text-xs text-slate-700 bg-white">
                          {apt.symptomDescription && (
                            <p><span className="font-semibold">Symptoms:</span> {apt.symptomDescription}</p>
                          )}
                          {apt.symptomDuration && (
                            <p><span className="font-semibold">Duration:</span> {apt.symptomDuration}</p>
                          )}
                          {apt.symptomSeverity != null && (
                            <p><span className="font-semibold">Severity:</span> {apt.symptomSeverity}/10</p>
                          )}
                          {apt.existingConditions && (
                            <p><span className="font-semibold">Existing conditions:</span> {apt.existingConditions}</p>
                          )}
                          {apt.currentMedications && (
                            <p><span className="font-semibold">Current medications:</span> {apt.currentMedications}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── AI Pre-Visit Triage Panel (Tri-State) ── */}
                  {summaryStatus === 'pending' && (
                    <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                      <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-700">AI Triage Summary Generating…</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">This typically takes 5–15 seconds. The page refreshes automatically.</p>
                      </div>
                    </div>
                  )}

                  {summaryStatus === 'completed' && (
                    <div className="p-4 bg-teal-50/70 border border-teal-200/70 rounded-2xl space-y-3">
                      {/* Header row */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2 text-teal-800 font-bold text-xs">
                          <Sparkles className="w-4 h-4 text-teal-600" />
                          <span>Clinician-Reference Triage Assistance</span>
                        </div>
                        <Badge variant={urgencyVariant(apt.preVisitSummary.urgency)}>
                          {apt.preVisitSummary.urgency?.toUpperCase()} URGENCY
                        </Badge>
                      </div>

                      {/* Chief Complaint */}
                      {apt.preVisitSummary.chiefComplaint && (
                        <div className="bg-white/80 p-2.5 rounded-xl border border-teal-100">
                          <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-0.5">Chief Complaint</p>
                          <p className="text-xs text-slate-800">{apt.preVisitSummary.chiefComplaint}</p>
                        </div>
                      )}

                      {/* Suggested Questions */}
                      {apt.preVisitSummary.suggestedQuestions?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-1.5">Suggested Questions</p>
                          <ol className="space-y-1">
                            {apt.preVisitSummary.suggestedQuestions.map((q, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                                <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                                {q}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      <p className="text-[10px] text-teal-600 italic flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        AI-generated — for clinician reference only, not a diagnosis.
                      </p>
                    </div>
                  )}

                  {summaryStatus === 'failed' && (
                    <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2 text-rose-700 font-bold text-xs">
                          <XCircle className="w-4 h-4 text-rose-500" />
                          <span>AI Triage Summary Unavailable</span>
                        </div>
                        <button
                          onClick={() => handleRetryAISummary(apt)}
                          disabled={retryingIds[apt._id]}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-rose-300 text-rose-700 text-[11px] font-semibold rounded-lg hover:bg-rose-50 transition disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3 h-3 ${retryingIds[apt._id] ? 'animate-spin' : ''}`} />
                          {retryingIds[apt._id] ? 'Queuing…' : 'Retry Summary'}
                        </button>
                      </div>

                      {apt.preVisitSummary?.rawSymptomText && (
                        <div className="bg-white/70 p-2.5 rounded-xl border border-rose-100 text-xs text-slate-700 whitespace-pre-line">
                          <p className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide mb-1">Patient-Reported Intake (Raw)</p>
                          {apt.preVisitSummary.rawSymptomText}
                        </div>
                      )}
                      <p className="text-[10px] text-rose-500 italic">
                        The AI summary could not be generated. Review raw intake above and proceed with the consultation as normal.
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Post-Visit Clinical Documentation Modal */}
      {activeAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Encounter Documentation: {activeAppointment.patientId?.name}
                </h3>
                <p className="text-xs text-slate-500">Edit notes before approving for patient visibility</p>
              </div>
              <button
                onClick={() => setActiveAppointment(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Primary Diagnosis</label>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="e.g. Acute Tension Headache"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Doctor Clinical Notes</label>
                <textarea
                  rows="4"
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Patient presented with... Examination showed... Recommended rest..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <label className="text-xs font-semibold text-slate-700">Prescribe Medication</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Medication name"
                    value={medication.name}
                    onChange={(e) => setMedication((p) => ({ ...p, name: e.target.value }))}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Dosage (e.g. 500mg)"
                    value={medication.dosage}
                    onChange={(e) => setMedication((p) => ({ ...p, dosage: e.target.value }))}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Frequency"
                    value={medication.frequency}
                    onChange={(e) => setMedication((p) => ({ ...p, frequency: e.target.value }))}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                  <input
                    type="number"
                    placeholder="Days"
                    value={medication.days}
                    onChange={(e) => setMedication((p) => ({ ...p, days: e.target.value }))}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 border-t pt-4">
              <Button onClick={() => handleSavePostVisit(false)} variant="outline" size="sm" isLoading={saveLoading}>
                Save as Draft
              </Button>
              <Button onClick={() => handleSavePostVisit(true)} variant="primary" size="sm" isLoading={saveLoading}>
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Approve & Release to Patient
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
