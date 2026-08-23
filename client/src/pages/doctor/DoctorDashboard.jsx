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
  const [prescriptions, setPrescriptions] = useState([
    { medicationName: '', dosage: '', frequency: 'Once daily', durationDays: 7, instructions: '' },
  ]);
  const [approvedText, setApprovedText] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [retryPatientSummaryLoading, setRetryPatientSummaryLoading] = useState(false);

  const fetchDoctorAppointments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/appointments/my');
      if (res.success) {
        setAppointments(res.data.appointments);
        // If an active modal is open, keep its state synced
        if (activeAppointment) {
          const updated = res.data.appointments.find((a) => a._id === activeAppointment._id);
          if (updated) {
            setActiveAppointment(updated);
            if (updated.postVisitSummary?.patientSummary?.generatedText && !approvedText) {
              setApprovedText(
                updated.postVisitSummary.patientSummary.approvedText ||
                  updated.postVisitSummary.patientSummary.generatedText
              );
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorAppointments();
    // Poll every 5 seconds to pick up completed/failed AI summaries
    const poll = setInterval(fetchDoctorAppointments, 5000);
    return () => clearInterval(poll);
  }, []);

  const openReviewModal = (apt) => {
    setActiveAppointment(apt);
    setClinicalNotes(apt.postVisitSummary?.clinicalNotes || '');
    setDiagnosis(apt.postVisitSummary?.diagnosis || '');
    const rxList = apt.postVisitSummary?.prescriptions;
    setPrescriptions(
      rxList && rxList.length > 0
        ? rxList.map((p) => ({
            medicationName: p.medicationName || '',
            dosage: p.dosage || '',
            frequency: p.frequency || 'Once daily',
            durationDays: p.durationDays || 7,
            instructions: p.instructions || '',
          }))
        : [{ medicationName: '', dosage: '', frequency: 'Once daily', durationDays: 7, instructions: '' }]
    );
    setApprovedText(
      apt.postVisitSummary?.patientSummary?.approvedText ||
        apt.postVisitSummary?.patientSummary?.generatedText ||
        apt.postVisitSummary?.clinicalNotes ||
        ''
    );
  };

  const handleAddPrescription = () => {
    setPrescriptions((prev) => [
      ...prev,
      { medicationName: '', dosage: '', frequency: 'Once daily', durationDays: 7, instructions: '' },
    ]);
  };

  const handleRemovePrescription = (index) => {
    setPrescriptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePrescriptionChange = (index, field, value) => {
    setPrescriptions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRetryAISummary = async (apt) => {
    setRetryingIds((prev) => ({ ...prev, [apt._id]: true }));
    try {
      await api.post(`/appointments/${apt._id}/retry-summary`);
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

  const handleSaveDraftNotes = async () => {
    if (!activeAppointment) return;
    setSaveLoading(true);

    try {
      const validPrescriptions = prescriptions.filter((p) => p.medicationName.trim());

      const payload = {
        clinicalNotes,
        diagnosis,
        prescriptions: validPrescriptions,
      };

      const res = await api.put(`/appointments/${activeAppointment._id}/post-visit`, payload);
      if (res.success) {
        fetchDoctorAppointments();
      }
    } catch (err) {
      console.error('Error saving post visit notes:', err);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleApprovePatientSummary = async () => {
    if (!activeAppointment || !approvedText.trim()) return;
    setApproveLoading(true);

    try {
      const res = await api.post(`/appointments/${activeAppointment._id}/approve-summary`, {
        approvedText: approvedText.trim(),
      });

      if (res.success) {
        setActiveAppointment(null);
        fetchDoctorAppointments();
      }
    } catch (err) {
      console.error('Error approving summary:', err);
    } finally {
      setApproveLoading(false);
    }
  };

  const handleRetryPatientSummary = async () => {
    if (!activeAppointment) return;
    setRetryPatientSummaryLoading(true);
    try {
      await api.post(`/appointments/${activeAppointment._id}/retry-patient-summary`);
      fetchDoctorAppointments();
    } catch (err) {
      console.error('Error retrying patient summary:', err);
    } finally {
      setRetryPatientSummaryLoading(false);
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

      {/* Post-Visit Clinical Documentation & Human-in-the-Loop Approval Modal */}
      {activeAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Clinical Encounter: {activeAppointment.patientId?.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Save clinical notes draft to generate an AI summary for your review. Patient sees summary ONLY after approval.
                </p>
              </div>
              <button
                onClick={() => setActiveAppointment(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* SECTION 1: Doctor Clinical Notes & Prescriptions */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">1. Doctor Clinical Notes</h4>

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
                <label className="text-xs font-semibold text-slate-700">Doctor Clinical Notes (Free Text)</label>
                <textarea
                  rows="4"
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Patient presented with... Examination showed... Recommended rest..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              {/* Dynamic Prescription List */}
              <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Structured Prescriptions</label>
                  <button
                    type="button"
                    onClick={handleAddPrescription}
                    className="text-[11px] font-semibold text-teal-600 hover:text-teal-700"
                  >
                    + Add Medication
                  </button>
                </div>

                {prescriptions.map((rx, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      placeholder="Medication name"
                      value={rx.medicationName}
                      onChange={(e) => handlePrescriptionChange(idx, 'medicationName', e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Dosage (e.g. 500mg)"
                      value={rx.dosage}
                      onChange={(e) => handlePrescriptionChange(idx, 'dosage', e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Frequency (e.g. Twice daily)"
                      value={rx.frequency}
                      onChange={(e) => handlePrescriptionChange(idx, 'frequency', e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Days"
                      value={rx.durationDays}
                      onChange={(e) => handlePrescriptionChange(idx, 'durationDays', Number(e.target.value))}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <div className="flex items-center justify-between gap-1">
                      <input
                        type="text"
                        placeholder="Instructions (opt)"
                        value={rx.instructions}
                        onChange={(e) => handlePrescriptionChange(idx, 'instructions', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      {prescriptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePrescription(idx)}
                          className="text-rose-500 hover:text-rose-700 font-bold px-1 text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveDraftNotes} variant="outline" size="sm" isLoading={saveLoading}>
                  Save Notes & Generate Summary
                </Button>
              </div>
            </div>

            {/* SECTION 2: Human-in-the-Loop Patient Summary Review */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  2. Patient-Facing Summary (Doctor Review & Approval Gate)
                </h4>
                <Badge variant={activeAppointment.postVisitSummary?.doctorApproved ? 'success' : 'warning'}>
                  {activeAppointment.postVisitSummary?.doctorApproved ? 'APPROVED & SENT' : 'DRAFT (PATIENT CANNOT SEE)'}
                </Badge>
              </div>

              {activeAppointment.postVisitSummary?.patientSummaryStatus === 'pending' && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">AI is rephrasing clinical notes for patient readability…</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Constraint: Only rephrasing clinical notes. No hallucinated advice added.</p>
                  </div>
                </div>
              )}

              {activeAppointment.postVisitSummary?.patientSummaryStatus === 'failed' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-rose-500" />
                      AI Patient Summary Generation Unavailable
                    </span>
                    <button
                      onClick={handleRetryPatientSummary}
                      disabled={retryPatientSummaryLoading}
                      className="flex items-center gap-1 px-2 py-1 bg-white border border-rose-300 text-rose-700 text-[11px] font-semibold rounded-lg hover:bg-rose-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${retryPatientSummaryLoading ? 'animate-spin' : ''}`} />
                      Retry AI Summary
                    </button>
                  </div>
                  <p className="text-xs text-rose-600">
                    The AI summary could not be generated. You can edit the manual summary below and release it directly to the patient.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Editable Patient Summary (Release Candidate)</span>
                  <span className="text-[10px] text-slate-400">Doctor edits override AI text</span>
                </label>
                <textarea
                  rows="5"
                  value={approvedText}
                  onChange={(e) => setApprovedText(e.target.value)}
                  placeholder="Summary text that the patient will see upon approval..."
                  className="w-full px-3 py-2 bg-teal-50/30 border border-teal-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Human-in-the-Loop Security:</strong> Clicking <strong>"Approve & Release to Patient"</strong> marks the visit as complete, makes this text visible on the patient dashboard, and sends an email notification.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 border-t pt-4">
              <Button onClick={() => setActiveAppointment(null)} variant="outline" size="sm">
                Close
              </Button>
              <Button
                onClick={handleApprovePatientSummary}
                variant="primary"
                size="sm"
                isLoading={approveLoading}
                disabled={!approvedText.trim()}
              >
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

