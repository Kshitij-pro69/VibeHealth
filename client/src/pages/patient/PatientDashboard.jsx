import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { Calendar, Clock, User, Sparkles, CheckCircle2, AlertCircle, Plus } from 'lucide-react';

export const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Booking state
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

  const fetchAppointments = async () => {
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

  const fetchDoctors = async () => {
    try {
      const res = await api.get('/doctors');
      if (res.success) {
        setDoctors(res.data.doctors);
      }
    } catch (err) {
      console.error('Failed to load doctors:', err);
    }
  };

  useEffect(() => {
    fetchAppointments();
    fetchDoctors();
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
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ }); // YYYY-MM-DD in IST

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
      console.error('Could not fetch doctor schedule:', err);
      setBookingError('Could not fetch doctor schedule. You can view full schedule on doctor details page.');
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
      }
    } catch (err) {
      setBookingError(err.message || 'Slot could not be held (likely reserved by another patient)');
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
        fetchAppointments();
      }
    } catch (err) {
      setBookingError(err.message || 'Booking conflict encountered');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name}</h1>
          <p className="text-sm text-slate-500">Manage your consultations and clinical triage summaries</p>
        </div>
        <Button onClick={() => setShowBookingModal(true)} className="inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Book Appointment</span>
        </Button>
      </div>

      {/* Appointments List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Your Appointments</h2>

        {loading ? (
          <Spinner />
        ) : appointments.length === 0 ? (
          <Card className="text-center py-12 space-y-4">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">No scheduled consultations yet</p>
              <p className="text-sm text-slate-500">Book your first doctor appointment in just a few clicks.</p>
            </div>
            <Button onClick={() => setShowBookingModal(true)} variant="outline" size="sm">
              Explore Available Physicians
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {appointments.map((apt) => (
              <Card key={apt._id} className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm">
                      {apt.doctorId?.name?.charAt(0) || 'D'}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">Dr. {apt.doctorId?.name}</h4>
                      <p className="text-xs text-slate-500">{apt.reasonForVisit}</p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      apt.status === 'confirmed'
                        ? 'success'
                        : apt.status === 'held'
                        ? 'warning'
                        : apt.status === 'completed'
                        ? 'primary'
                        : 'danger'
                    }
                  >
                    {apt.status}
                  </Badge>
                </div>

                <div className="flex items-center space-x-4 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {new Date(apt.startTime).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {new Date(apt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Pre-Visit Triage Notice */}
                {apt.preVisitSummary?.symptoms?.length > 0 && (
                  <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-teal-800 font-semibold">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      <span>AI Triage Assistance Generated</span>
                    </div>
                    <p className="text-slate-600">
                      Identified symptoms:{' '}
                      <span className="font-medium text-slate-800">
                        {apt.preVisitSummary.symptoms.join(', ')}
                      </span>
                    </p>
                  </div>
                )}

                {/* Post-Visit Doctor-Approved Summary (Human-in-the-Loop Gate) */}
                {apt.postVisitSummary?.doctorApproved && (
                  <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-teal-600" />
                        <span>Physician Post-Visit Summary</span>
                      </div>
                      <Badge variant="success">APPROVED BY DR. {apt.doctorId?.name?.toUpperCase()}</Badge>
                    </div>

                    {/* Approved Text Narrative */}
                    <div className="bg-white p-3 rounded-xl border border-teal-100 text-slate-800 leading-relaxed whitespace-pre-line">
                      {apt.postVisitSummary.patientSummary?.approvedText ||
                        apt.postVisitSummary.clinicalNotes}
                    </div>

                    {/* Medication Schedule Table */}
                    {apt.postVisitSummary.patientSummary?.medicationSchedule?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-semibold text-teal-900 text-[11px] uppercase tracking-wide">Medication Schedule</p>
                        <div className="bg-white rounded-xl border border-teal-100 overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-teal-100/50 text-teal-900 text-[10px] uppercase font-bold border-b border-teal-100">
                                <th className="p-2">Medication</th>
                                <th className="p-2">Schedule</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-teal-50">
                              {apt.postVisitSummary.patientSummary.medicationSchedule.map((m, idx) => (
                                <tr key={idx} className="text-[11px]">
                                  <td className="p-2 font-medium text-slate-900">{m.medication}</td>
                                  <td className="p-2 text-slate-600">{m.schedule}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Prescriptions List Fallback */}
                    {(!apt.postVisitSummary.patientSummary?.medicationSchedule?.length) &&
                      apt.postVisitSummary.prescriptions?.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-semibold text-teal-900 text-[11px] uppercase tracking-wide">Prescriptions</p>
                          <div className="bg-white p-2.5 rounded-xl border border-teal-100 space-y-1">
                            {apt.postVisitSummary.prescriptions.map((rx, idx) => (
                              <p key={idx} className="text-slate-800">
                                • <strong>{rx.medicationName}</strong> ({rx.dosage}) — {rx.frequency} for {rx.durationDays} days
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Follow-up Steps */}
                    {apt.postVisitSummary.patientSummary?.followUpSteps?.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-semibold text-teal-900 text-[11px] uppercase tracking-wide">Follow-Up Steps</p>
                        <ul className="bg-white p-2.5 rounded-xl border border-teal-100 space-y-1 text-slate-700">
                          {apt.postVisitSummary.patientSummary.followUpSteps.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-teal-600 font-bold">•</span>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}


                {/* Doctor Unavailability Cancellation Banner & Action Buttons */}
                {apt.status === 'cancelled' && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>
                        {apt.cancellationReason === 'doctor_unavailable'
                          ? 'Cancelled Due to Physician Unavailability'
                          : 'Appointment Cancelled'}
                      </span>
                    </div>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      {apt.cancellationReason === 'doctor_unavailable'
                        ? 'The physician was required to adjust their schedule. You can immediately choose a new date or book with another specialist.'
                        : 'This consultation schedule was cancelled.'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {apt.doctorId?._id && (
                        <button
                          onClick={() => navigate(`/patient/doctors/${apt.doctorId._id}`)}
                          className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-[11px] flex items-center gap-1 transition"
                        >
                          <Calendar className="w-3 h-3" />
                          Rebook Different Date
                        </button>
                      )}
                      <button
                        onClick={() => navigate('/patient/doctors')}
                        className="px-2.5 py-1.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-lg font-semibold text-[11px] flex items-center gap-1 transition"
                      >
                        <User className="w-3 h-3" />
                        Rebook with Another Doctor
                      </button>
                    </div>
                  </div>
                )}

                {/* Post-Visit Clinical Summary (Only if approved by doctor) */}
                {apt.postVisitSummary?.doctorApproved && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Physician Approved Post-Visit Summary</span>
                    </div>
                    <p className="text-slate-700">
                      <strong>Diagnosis:</strong> {apt.postVisitSummary.diagnosis}
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
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
                    <p className="text-[11px] text-slate-500 mt-1">₹{doc.consultationFee} consultation fee</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Select Slot & Hold */}
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

                <Button type="submit" className="w-full" isLoading={bookingLoading}>
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
