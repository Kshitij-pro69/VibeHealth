import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { Calendar, Clock, User, Sparkles, CheckCircle2, AlertCircle, Plus } from 'lucide-react';

export const PatientDashboard = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Booking state
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [holdToken, setHoldToken] = useState(null);
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
    setBookingError('');

    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/doctors/${doc.userId._id}/slots?date=${today}`);
      if (res.success) {
        setAvailableSlots(res.data.slots);
      }
    } catch (err) {
      setBookingError('Could not fetch doctor schedule');
    }
  };

  const handleHoldSlot = async (slot) => {
    setBookingError('');
    try {
      const res = await api.post('/appointments/hold', {
        doctorId: selectedDoctor.userId._id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });

      if (res.success) {
        setSelectedSlot(slot);
        setHoldToken(res.data.holdToken);
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

    try {
      const res = await api.post('/appointments/confirm', {
        doctorId: selectedDoctor.userId._id,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reasonForVisit,
        patientNotes,
      });

      if (res.success) {
        setShowBookingModal(false);
        setSelectedSlot(null);
        setHoldToken(null);
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
                    <p className="text-[11px] text-slate-500 mt-1">${doc.consultationFee} consultation fee</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Select Slot & Hold */}
            {selectedDoctor && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">2. Select Today's Open Slot</label>
                  {holdExpiresAt && (
                    <Badge variant="warning" className="text-[10px]">
                      Slot locked for 5m
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
                  {availableSlots.map((slot, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={!slot.isAvailable}
                      onClick={() => handleHoldSlot(slot)}
                      className={`p-2 rounded-lg text-xs font-medium border transition-all ${
                        selectedSlot?.startTime === slot.startTime
                          ? 'bg-teal-600 text-white border-teal-600'
                          : slot.isAvailable
                          ? 'border-slate-200 bg-white hover:border-teal-500 text-slate-700'
                          : 'border-slate-100 bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
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
