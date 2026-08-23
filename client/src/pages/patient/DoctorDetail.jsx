import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import {
  ArrowLeft,
  Calendar,
  Clock,
  IndianRupee,
  AlertTriangle,
  Stethoscope,
  CheckCircle2,
  Timer,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// Clinic timezone — matches the backend default
const CLINIC_TZ = 'Asia/Kolkata';

/** Format a UTC ISO string to local time string for display */
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

/** Format a UTC ISO string to local date string for display */
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', {
    timeZone: CLINIC_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/** Get today's date in YYYY-MM-DD using clinic timezone */
const todayStr = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ }); // en-CA gives YYYY-MM-DD

/** Advance a YYYY-MM-DD date string by N days */
const shiftDate = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
};

export const DoctorDetail = () => {
  const { doctorId } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Availability
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [slotsData, setSlotsData] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Booking flow
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [holdData, setHoldData] = useState(null);  // { holdToken, expiresAt, countdown }
  const [holdInterval, setHoldInterval] = useState(null);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  // Structured symptom intake
  const [symptomDescription, setSymptomDescription] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState(5);
  const [existingConditions, setExistingConditions] = useState('');
  const [currentMedications, setCurrentMedications] = useState('');


  // --- Fetch profile ---
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/doctors/${doctorId}/profile`);
        if (res.success) setDoctor(res.data.doctor);
      } catch (err) {
        console.error('Failed to load doctor profile:', err);
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [doctorId]);

  // --- Fetch slots whenever date changes ---
  const fetchSlots = useCallback(async (date) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    setHoldData(null);
    setBookingError('');
    clearInterval(holdInterval);
    try {
      const res = await api.get(
        `/doctors/${doctorId}/availability?date=${date}&tz=${encodeURIComponent(CLINIC_TZ)}`
      );
      if (res.success) setSlotsData(res.data);
    } catch (err) {
      console.error('Failed to load slots:', err);
    } finally {
      setSlotsLoading(false);
    }
  }, [doctorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Hold countdown ticker ---
  useEffect(() => {
    return () => clearInterval(holdInterval);
  }, [holdInterval]);

  const startCountdown = (expiresAt) => {
    clearInterval(holdInterval);
    const id = setInterval(() => {
      const secs = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
      setHoldData((prev) => (prev ? { ...prev, countdown: secs } : null));
      if (secs <= 0) {
        clearInterval(id);
        setHoldData(null);
        setSelectedSlot(null);
        setBookingError('Slot hold expired. Please select a slot again.');
        fetchSlots(selectedDate);
      }
    }, 1000);
    setHoldInterval(id);
    return id;
  };

  // --- Hold a slot ---
  const handleHoldSlot = async (slot) => {
    if (holdData) return; // already holding one
    setBookingError('');
    try {
      const res = await api.post('/appointments/hold', {
        doctorId,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      if (res.success) {
        setSelectedSlot(slot);
        const expiry = res.data.expiresAt;
        const countdown = Math.max(0, Math.round((new Date(expiry) - Date.now()) / 1000));
        setHoldData({
          appointmentId: res.data.appointmentId,
          holdToken: res.data.holdToken,
          expiresAt: expiry,
          countdown,
        });
        startCountdown(expiry);
      }
    } catch (err) {
      setBookingError(err.message || 'Could not hold this slot — it may have just been taken.');
    }
  };

  // --- Confirm booking ---
  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!selectedSlot || !reasonForVisit.trim()) return;
    setBookingLoading(true);
    setBookingError('');
    try {
      const confirmEndpoint = holdData?.appointmentId
        ? `/appointments/${holdData.appointmentId}/confirm`
        : '/appointments/confirm';
      const res = await api.post(confirmEndpoint, {
        doctorId,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reasonForVisit,
        patientNotes,
        symptomDescription,
        symptomDuration,
        symptomSeverity: symptomSeverity ? Number(symptomSeverity) : null,
        existingConditions,
        currentMedications,
      });
      if (res.success) {
        clearInterval(holdInterval);
        setBookingSuccess(true);
        setHoldData(null);
        // Refresh slots to reflect the new booking
        setTimeout(() => fetchSlots(selectedDate), 800);
      }
    } catch (err) {
      setBookingError(err.message || 'Booking failed — please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  // --- Date navigation helpers ---
  const handleDateChange = (e) => setSelectedDate(e.target.value);
  const prevDay = () => setSelectedDate((d) => shiftDate(d, -1));
  const nextDay = () => setSelectedDate((d) => shiftDate(d, 1));

  if (profileLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (!doctor) {
    return (
      <Card className="text-center py-16">
        <p className="text-slate-600 font-semibold">Doctor not found.</p>
        <button
          onClick={() => navigate('/patient/doctors')}
          className="mt-4 text-teal-600 text-sm hover:underline"
        >
          ← Back to search
        </button>
      </Card>
    );
  }

  const slots = slotsData?.slots ?? [];
  const onLeave = slotsData?.onLeave ?? false;
  const noHours = !onLeave && slotsData && slots.length === 0 && !slotsLoading;
  const isToday = selectedDate === todayStr();
  const isPast = selectedDate < todayStr();

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/patient/doctors')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All Physicians
      </button>

      {/* Doctor profile card */}
      <Card className="flex flex-col sm:flex-row gap-6">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-md">
          {(doctor.userId?.name || '')
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join('')
            .toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dr. {doctor.userId?.name}</h1>
            <Badge variant="primary" className="mt-1">
              {doctor.specialty}
            </Badge>
          </div>
          {doctor.bio && <p className="text-sm text-slate-500 leading-relaxed">{doctor.bio}</p>}
          <div className="flex flex-wrap gap-4 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <IndianRupee className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-semibold text-slate-800">₹{doctor.consultationFee}</span>
              <span className="text-slate-400">per visit</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-semibold text-slate-800">{doctor.slotDurationMinutes ?? 30} min</span>
              <span className="text-slate-400">slots</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-semibold text-slate-800">{(doctor.workingHours || []).length}</span>
              <span className="text-slate-400">days/week</span>
            </span>
          </div>
        </div>
      </Card>

      {/* Date picker with prev/next navigation */}
      <Card className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-1 flex-shrink-0">
          <Calendar className="w-4 h-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">Select Date</span>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <button
            onClick={prevDay}
            disabled={isToday || isPast}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <input
            type="date"
            value={selectedDate}
            min={todayStr()}
            onChange={handleDateChange}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition bg-white"
          />
          <button
            onClick={nextDay}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        {slotsData && !slotsLoading && (
          <span className="text-xs text-slate-400 flex-shrink-0">
            {slots.length} slot{slots.length !== 1 ? 's' : ''} available
          </span>
        )}
      </Card>

      {/* Slot grid */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm">Available Times</h2>
          {slotsData?.workingHours && (
            <span className="text-xs text-slate-400">
              {slotsData.workingHours.startTime} – {slotsData.workingHours.endTime}
            </span>
          )}
        </div>

        {slotsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : onLeave ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Doctor is on approved leave</p>
              {slotsData?.reason && slotsData.reason !== 'Doctor is on approved leave' && (
                <p className="text-xs text-amber-700 mt-0.5">{slotsData.reason}</p>
              )}
              <p className="text-xs text-amber-600 mt-1">Please select a different date.</p>
            </div>
          </div>
        ) : noHours ? (
          <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <Info className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Not available on this day</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {slotsData?.reason || 'No working hours configured for this day of week.'}
              </p>
            </div>
          </div>
        ) : slots.length === 0 && !slotsLoading && slotsData ? (
          <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <Info className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <p className="text-sm text-slate-600">All slots are booked or in the past for this day.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {slots.map((slot, i) => {
              const isSelected = selectedSlot?.startTime === slot.startTime;
              const isHeld = isSelected && holdData;
              return (
                <button
                  key={i}
                  onClick={() => !isHeld && handleHoldSlot(slot)}
                  disabled={isHeld && !isSelected}
                  className={`
                    relative py-2 px-1 rounded-xl text-xs font-semibold border transition-all duration-150
                    ${isSelected && isHeld
                      ? 'bg-teal-600 text-white border-teal-600 ring-2 ring-teal-400/40 cursor-default'
                      : isSelected
                      ? 'bg-teal-50 border-teal-400 text-teal-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 cursor-pointer'
                    }
                  `}
                >
                  {fmtTime(slot.startTime)}
                  {isHeld && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                      <Timer className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Hold status + booking form */}
      {selectedSlot && (
        <Card className="space-y-5">
          {/* Hold countdown banner */}
          {holdData && (
            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">
                    Slot held: {fmtTime(selectedSlot.startTime)} – {fmtTime(selectedSlot.endTime)}
                  </p>
                  <p className="text-[11px] text-amber-600">{fmtDate(selectedSlot.startTime)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-amber-700 tabular-nums">
                  {String(Math.floor((holdData.countdown ?? 0) / 60)).padStart(2, '0')}:
                  {String((holdData.countdown ?? 0) % 60).padStart(2, '0')}
                </p>
                <p className="text-[10px] text-amber-500">remaining</p>
              </div>
            </div>
          )}

          {/* Success state */}
          {bookingSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="font-bold text-slate-800">Booking Confirmed!</p>
              <p className="text-xs text-slate-500">
                Your appointment with Dr. {doctor.userId?.name} on {fmtDate(selectedSlot.startTime)} at{' '}
                {fmtTime(selectedSlot.startTime)} has been booked.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBookingSuccess(false);
                  setSelectedSlot(null);
                  setReasonForVisit('');
                  setPatientNotes('');
                  setSymptomDescription('');
                  setSymptomDuration('');
                  setSymptomSeverity(5);
                  setExistingConditions('');
                  setCurrentMedications('');
                }}
              >
                Book Another Slot
              </Button>
            </div>
          ) : (
            /* Booking form */
            <form onSubmit={handleConfirmBooking} className="space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">
                Complete Booking
                {selectedSlot && (
                  <span className="ml-2 font-normal text-slate-500">
                    — {fmtTime(selectedSlot.startTime)}, {fmtDate(selectedSlot.startTime)}
                  </span>
                )}
              </h3>

              {bookingError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{bookingError}</span>
                </div>
              )}

              {/* ⚠️ Emergency Safety Notice — always visible above the form */}
              <div className="flex items-start gap-3 p-3 bg-rose-50/80 border border-rose-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-rose-800">
                  <strong>Not a diagnostic tool.</strong> The information below is for your
                  physician&apos;s pre-consultation reference only. It is not reviewed in real
                  time and does not constitute medical advice.{' '}
                  <strong>
                    If you are experiencing a medical emergency, call emergency services (112 /
                    102) immediately. Do not book an appointment.
                  </strong>
                </div>
              </div>

              {/* Reason for Visit */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Reason for Visit <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reasonForVisit}
                  onChange={(e) => setReasonForVisit(e.target.value)}
                  placeholder="e.g. Annual cardiac check-up, follow-up on blood pressure"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition"
                />
              </div>

              {/* Symptom Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Symptom Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={symptomDescription}
                  onChange={(e) => setSymptomDescription(e.target.value)}
                  placeholder="Describe your symptoms in your own words. e.g. Sharp chest pain on the left side, worse when lying down…"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none"
                />
              </div>

              {/* Duration + Severity row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Duration */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={symptomDuration}
                    onChange={(e) => setSymptomDuration(e.target.value)}
                    placeholder="e.g. 3 days, since last week"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition"
                  />
                </div>

                {/* Severity Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Severity
                    </label>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      symptomSeverity <= 3
                        ? 'bg-emerald-100 text-emerald-700'
                        : symptomSeverity <= 6
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {symptomSeverity}/10
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={symptomSeverity}
                    onChange={(e) => setSymptomSeverity(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer accent-teal-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Mild (1)</span>
                    <span>Moderate (5)</span>
                    <span>Severe (10)</span>
                  </div>
                </div>
              </div>

              {/* Existing Conditions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Existing Medical Conditions{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={existingConditions}
                  onChange={(e) => setExistingConditions(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Hypertension, Asthma…"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none"
                />
              </div>

              {/* Current Medications */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Current Medications{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={currentMedications}
                  onChange={(e) => setCurrentMedications(e.target.value)}
                  placeholder="e.g. Metformin 500mg twice daily, Amlodipine 5mg…"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSelectedSlot(null);
                    setHoldData(null);
                    setBookingError('');
                    clearInterval(holdInterval);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" isLoading={bookingLoading}>
                  Confirm Booking
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
};
