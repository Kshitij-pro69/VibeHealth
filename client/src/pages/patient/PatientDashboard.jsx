import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { CardSkeleton } from '../../components/common/Skeleton';
import {
  Calendar,
  Clock,
  User,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  Pill,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Timer,
  AlertTriangle,
  Stethoscope,
  ChevronRight,
  FileText,
} from 'lucide-react';

/** Computes a human-readable live countdown string for an upcoming date */
const getCountdownString = (targetDateIso) => {
  const diffMs = new Date(targetDateIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Session Active Now';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `Starts in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
  }
  if (diffHours > 0) {
    const remMins = diffMins % 60;
    return `Starts in ${diffHours}h ${remMins}m`;
  }
  return `Starts in ${diffMins} min${diffMins > 1 ? 's' : ''}`;
};

export const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarStatus, setCalendarStatus] = useState('not_connected');

  // Booking Modal State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [holdToken, setHoldToken] = useState(null);
  const [heldAppointmentId, setHeldAppointmentId] = useState(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [apptRes, calRes, docRes] = await Promise.allSettled([
        api.get('/appointments/my'),
        api.get('/auth/calendar-status'),
        api.get('/doctors'),
      ]);

      if (apptRes.status === 'fulfilled' && apptRes.value.success) {
        setAppointments(apptRes.value.data.appointments || []);
      }
      if (calRes.status === 'fulfilled' && calRes.value.success) {
        setCalendarStatus(calRes.value.data.calendarStatus || 'not_connected');
      }
      if (docRes.status === 'fulfilled' && docRes.value.success) {
        setDoctors(docRes.value.data.doctors || []);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleSelectDoctor = async (doc) => {
    setSelectedDoctor(doc);
    setSelectedSlot(null);
    setHoldToken(null);
    setHeldAppointmentId(null);
    setBookingError('');
    setSlotsLoading(true);

    const targetDocId = doc.userId?._id || doc.userId || doc._id;
    const CLINIC_TZ = 'Asia/Kolkata';
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });

    try {
      const res = await api.get(
        `/doctors/${targetDocId}/availability?date=${todayStr}&tz=${encodeURIComponent(CLINIC_TZ)}`
      );
      if (res.success && res.data?.slots) {
        setAvailableSlots(res.data.slots);
      } else {
        setAvailableSlots([]);
      }
    } catch (err) {
      console.error('Could not fetch schedule:', err);
      setBookingError('Could not fetch schedule for today.');
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleHoldSlot = async (slot) => {
    setBookingError('');
    const targetDocId = selectedDoctor?.userId?._id || selectedDoctor?.userId || selectedDoctor?._id;
    try {
      const res = await api.post('/appointments/hold', {
        doctorId: targetDocId,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });

      if (res.success) {
        setSelectedSlot(slot);
        setHoldToken(res.data.holdToken || res.data.appointment?._id);
        setHeldAppointmentId(res.data.appointment?._id);
        setHoldExpiresAt(res.data.expiresAt);
        addToast('Slot held for 5 minutes! Complete symptom details to confirm.', 'info');
      }
    } catch (err) {
      const msg = err.message || 'Slot could not be held (likely reserved by another patient)';
      setBookingError(msg);
      addToast(msg, 'danger');
    }
  };

  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!selectedSlot) return;

    setBookingLoading(true);
    setBookingError('');

    const targetDocId = selectedDoctor?.userId?._id || selectedDoctor?.userId || selectedDoctor?._id;

    try {
      const res = await api.post('/appointments/confirm', {
        appointmentId: heldAppointmentId,
        doctorId: targetDocId,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reasonForVisit,
        patientNotes,
        symptoms: reasonForVisit ? [reasonForVisit] : [],
        duration: '1-3 days',
        severity: 5,
      });

      if (res.success) {
        setShowBookingModal(false);
        setSelectedSlot(null);
        setHoldToken(null);
        setHeldAppointmentId(null);
        setReasonForVisit('');
        setPatientNotes('');
        addToast('Consultation successfully booked! Confirmation email queued.', 'success');
        fetchDashboardData();
      }
    } catch (err) {
      const msg = err.message || 'Booking conflict encountered';
      setBookingError(msg);
      addToast(msg, 'danger');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelAppointment = async (apptId) => {
    if (!window.confirm('Are you sure you want to cancel this consultation?')) return;
    try {
      const res = await api.post(`/appointments/${apptId}/cancel`);
      if (res.success) {
        addToast('Appointment cancelled successfully.', 'warning');
        fetchDashboardData();
      }
    } catch (err) {
      addToast(err.message || 'Failed to cancel appointment.', 'danger');
    }
  };

  // Categorize appointments
  const upcomingAppointments = appointments.filter(
    (a) => a.status === 'confirmed' || a.status === 'held'
  );
  const pastAppointments = appointments.filter(
    (a) => a.status === 'completed' || a.status === 'cancelled'
  );

  // Consolidate active medication schedule across all past encounters
  const activeMedications = [];
  appointments.forEach((apt) => {
    const schedule = apt.postVisitSummary?.patientSummary?.medicationSchedule;
    if (schedule && Array.isArray(schedule)) {
      schedule.forEach((med) => {
        if (med.medication) {
          activeMedications.push({
            doctorName: apt.doctorId?.name || 'Physician',
            date: new Date(apt.startTime).toLocaleDateString(),
            medicine: med.medication,
            dosage: med.dosage || med.schedule || 'As prescribed',
          });
        }
      });
    }
  });

  return (
    <div className="space-y-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-teal-900 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Patient Portal
            </span>
            <span className="text-xs text-slate-300">IST (UTC+5:30)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome, {user?.name}</h1>
          <p className="text-sm text-slate-300">
            Manage your medical consultations, pre-visit triage, and physician post-visit care plans
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            onClick={() => navigate('/patient/doctors')}
            variant="outline"
            className="border-slate-600 text-white hover:bg-white/10"
          >
            <Stethoscope className="w-4 h-4 mr-1.5" />
            Find Doctors
          </Button>
          <Button
            onClick={() => setShowBookingModal(true)}
            className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold shadow-lg shadow-teal-500/20"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Book Consult
          </Button>
        </div>
      </div>

      {/* Google Calendar Status Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            calendarStatus === 'connected'
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : calendarStatus === 'reauth_required'
              ? 'bg-amber-50 text-amber-600 border border-amber-200'
              : 'bg-slate-100 text-slate-500'
          }`}>
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Google Calendar Synchronization</span>
              {calendarStatus === 'connected' ? (
                <Badge variant="success">ACTIVE & SYNCED</Badge>
              ) : calendarStatus === 'reauth_required' ? (
                <Badge variant="warning">RECONNECTION NEEDED</Badge>
              ) : (
                <Badge variant="default">NOT CONNECTED</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {calendarStatus === 'connected'
                ? 'Your booked consultations automatically sync to your personal Google Calendar.'
                : calendarStatus === 'reauth_required'
                ? 'Google OAuth access expired. Please reconnect to resume automatic event syncing.'
                : 'Connect your Google Calendar to receive automatic event reminders and sync schedule.'}
            </p>
          </div>
        </div>
        <Button
          onClick={() => navigate('/settings')}
          variant="outline"
          size="sm"
          className="shrink-0 text-xs border-slate-200 hover:bg-slate-50"
        >
          Manage Calendar
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Upcoming & Past Appointments */}
        <div className="lg:col-span-2 space-y-8">
          {/* Section 1: Upcoming Consultations with Countdown */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600" />
                Upcoming Consultations
              </h2>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {upcomingAppointments.length} Scheduled
              </span>
            </div>

            {loading ? (
              <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <Card className="p-8 text-center space-y-3 bg-white border-dashed border-slate-300">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">No Upcoming Consultations</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    You have no scheduled consultations. Book your first appointment with an active physician.
                  </p>
                </div>
                <Button onClick={() => navigate('/patient/doctors')} size="sm" className="bg-teal-600 text-white">
                  Browse Active Doctors
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {upcomingAppointments.map((apt) => (
                  <Card key={apt._id} className="p-5 space-y-4 hover:border-teal-300 transition shadow-xs">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-11 h-11 rounded-2xl bg-teal-100/70 text-teal-900 border border-teal-200/80 flex items-center justify-center font-bold text-sm">
                          {apt.doctorId?.name?.charAt(0) || 'D'}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">Dr. {apt.doctorId?.name}</h3>
                          <p className="text-xs text-teal-700 font-medium">
                            {apt.doctorId?.specialty || 'General Physician'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={apt.status === 'confirmed' ? 'success' : 'warning'}>
                          {apt.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {/* Schedule & Countdown Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700">
                      <div className="flex items-center space-x-4">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(apt.startTime).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(apt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Live Countdown Badge */}
                      <div className="flex items-center gap-1.5 font-bold text-teal-900 bg-teal-100/70 px-2.5 py-1 rounded-lg border border-teal-200/60">
                        <Timer className="w-3.5 h-3.5 text-teal-700 animate-pulse" />
                        <span>{getCountdownString(apt.startTime)}</span>
                      </div>
                    </div>

                    {/* Reason & AI Triage Summary */}
                    <div className="space-y-1.5 text-xs">
                      <p className="text-slate-600">
                        <strong className="text-slate-900">Reason for Visit:</strong> {apt.reasonForVisit}
                      </p>
                      {apt.preVisitSummary?.symptoms?.length > 0 && (
                        <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl space-y-1">
                          <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                            <span>AI Triage Intake Registered</span>
                          </div>
                          <p className="text-slate-600">
                            Identified Symptoms: <span className="font-semibold text-slate-900">{apt.preVisitSummary.symptoms.join(', ')}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-1 border-t border-slate-100">
                      <Button
                        onClick={() => handleCancelAppointment(apt._id)}
                        variant="outline"
                        size="sm"
                        className="text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        Cancel Consultation
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Past Encounters & Post-Visit Summaries */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                Past Medical Encounters
              </h2>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {pastAppointments.length} Completed / Cancelled
              </span>
            </div>

            {pastAppointments.length === 0 ? (
              <Card className="p-6 text-center text-xs text-slate-400 bg-white">
                No past appointment history recorded.
              </Card>
            ) : (
              <div className="space-y-4">
                {pastAppointments.map((apt) => (
                  <Card key={apt._id} className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                          {apt.doctorId?.name?.charAt(0) || 'D'}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">Dr. {apt.doctorId?.name}</h4>
                          <p className="text-xs text-slate-500">{new Date(apt.startTime).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={apt.status === 'completed' ? 'primary' : 'danger'}>
                          {apt.status.toUpperCase()}
                        </Badge>

                        {/* Quick Rebook Button */}
                        {apt.doctorId?._id && (
                          <Button
                            onClick={() => navigate(`/patient/doctors/${apt.doctorId._id}`)}
                            variant="outline"
                            size="sm"
                            className="text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Rebook Physician
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Approved Post-Visit Care Summary */}
                    {apt.postVisitSummary?.doctorApproved && (
                      <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-teal-600" />
                            <span>Physician Approved Post-Visit Summary</span>
                          </div>
                          <Badge variant="success">APPROVED BY DR. {apt.doctorId?.name?.toUpperCase()}</Badge>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-teal-100 text-slate-800 leading-relaxed whitespace-pre-line">
                          {apt.postVisitSummary.patientSummary?.approvedText || apt.postVisitSummary.clinicalNotes}
                        </div>

                        {apt.postVisitSummary.patientSummary?.medicationSchedule?.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="font-bold text-teal-900 text-[11px] uppercase tracking-wide">Medication Care Plan</p>
                            <div className="bg-white rounded-xl border border-teal-100 overflow-hidden">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-teal-100/50 text-teal-900 text-[10px] uppercase font-bold border-b border-teal-100">
                                    <th className="p-2">Medication</th>
                                    <th className="p-2">Dosage & Schedule</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-teal-50">
                                  {apt.postVisitSummary.patientSummary.medicationSchedule.map((m, idx) => (
                                    <tr key={idx} className="text-[11px]">
                                      <td className="p-2 font-semibold text-slate-900">{m.medication}</td>
                                      <td className="p-2 text-slate-600">{m.dosage || m.schedule}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Active Medications & Quick Shortcuts */}
        <div className="space-y-6">
          {/* Active Medication Schedule Card */}
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Pill className="w-4 h-4 text-teal-600" />
              Active Medication Schedule
            </h3>

            {activeMedications.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                <Pill className="w-6 h-6 text-slate-300 mx-auto" />
                <p>No active prescriptions recorded.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {activeMedications.map((med, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 text-xs">
                    <p className="font-bold text-slate-900">{med.medicine}</p>
                    <p className="text-teal-700 font-medium text-[11px]">{med.dosage}</p>
                    <p className="text-[10px] text-slate-400">Prescribed by Dr. {med.doctorName} • {med.date}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Help & Emergency Notice */}
          <Card className="p-5 space-y-3 bg-rose-50/70 border-rose-200">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Medical Emergency Notice</span>
            </div>
            <p className="text-xs text-rose-800 leading-relaxed">
              VibeHealth is an appointment & triage assistance system. If you are experiencing severe chest pain, shortness of breath, or a medical emergency, call your local emergency services immediately.
            </p>
          </Card>
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Book a Consultation</h3>
              <button
                onClick={() => setShowBookingModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {bookingError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            {/* Step 1: Select Doctor */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">1. Select a Physician</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {doctors.map((doc) => (
                  <div
                    key={doc._id}
                    onClick={() => handleSelectDoctor(doc)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedDoctor?._id === doc._id
                        ? 'border-teal-600 bg-teal-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-semibold text-xs text-slate-900">Dr. {doc.userId?.name}</p>
                    <p className="text-[11px] text-teal-700">{doc.specialty}</p>
                    <p className="text-[11px] text-slate-500 mt-1">₹{doc.consultationFee} fee</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Select Slot */}
            {selectedDoctor && (
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Dr. {selectedDoctor.userId?.name}</p>
                    <p className="text-[11px] text-teal-700">{selectedDoctor.specialty} • ₹{selectedDoctor.consultationFee}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = selectedDoctor.userId?._id || selectedDoctor.userId || selectedDoctor._id;
                      navigate(`/patient/doctors/${targetId}`);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800 underline"
                  >
                    View Full Schedule →
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <label className="text-xs font-semibold text-slate-700">Select Today's Available Slot</label>
                  {holdExpiresAt && (
                    <Badge variant="warning" className="text-[10px]">
                      Slot locked for 5m
                    </Badge>
                  )}
                </div>

                {slotsLoading ? (
                  <div className="py-6 text-center">
                    <Spinner size="sm" />
                    <p className="text-xs text-slate-400 mt-1">Computing available slots...</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                    <p className="text-xs text-slate-600">No open slots available for today.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = selectedDoctor.userId?._id || selectedDoctor.userId || selectedDoctor._id;
                        navigate(`/patient/doctors/${targetId}`);
                      }}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-xs transition"
                    >
                      Book Future Date on Doctor Page
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
                    {availableSlots.map((slot, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={!slot.isAvailable}
                        onClick={() => handleHoldSlot(slot)}
                        className={`p-2 rounded-lg text-xs font-medium border transition-all ${
                          selectedSlot?.startTime === slot.startTime
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : slot.isAvailable
                            ? 'border-slate-200 bg-white hover:border-teal-500 text-slate-700'
                            : 'border-slate-100 bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Clinical Intake Notes */}
            {selectedSlot && (
              <form onSubmit={handleConfirmBooking} className="space-y-4 border-t pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Reason for Visit <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={reasonForVisit}
                    onChange={(e) => setReasonForVisit(e.target.value)}
                    placeholder="e.g. Persistent headache and fatigue for 3 days"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Pre-Visit Notes (For AI Clinical Triage)
                  </label>
                  <textarea
                    rows="3"
                    value={patientNotes}
                    onChange={(e) => setPatientNotes(e.target.value)}
                    placeholder="Describe symptoms, duration, current medications..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <Button type="submit" className="w-full bg-teal-600 text-white" isLoading={bookingLoading}>
                  Confirm Consultation Booking
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
