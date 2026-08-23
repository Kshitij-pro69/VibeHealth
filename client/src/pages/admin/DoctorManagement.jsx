import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import {
  Stethoscope,
  Plus,
  Search,
  Filter,
  Clock,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Edit2,
  Power,
  Calendar,
  X,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const DAYS = [
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
  { id: 0, name: 'Sunday', short: 'Sun' },
];

const SPECIALTIES = [
  'All Specialties',
  'Cardiology',
  'Dermatology',
  'Neurology',
  'Pediatrics',
  'Internal Medicine',
  'Orthopedics',
  'Psychiatry',
  'General Practice',
];

export const DoctorManagement = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All Specialties');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    specialty: 'General Practice',
    consultationFee: 50,
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    bio: '',
    workingHours: [
      { dayOfWeek: 1, enabled: true, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 2, enabled: true, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 3, enabled: true, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 4, enabled: true, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 5, enabled: true, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 6, enabled: false, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 0, enabled: false, startTime: '09:00', endTime: '13:00' },
    ],
  });

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedSpecialty !== 'All Specialties') params.specialty = selectedSpecialty;
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;

      const queryString = new URLSearchParams(params).toString();
      const res = await api.get(`/admin/doctors${queryString ? '?' + queryString : ''}`);
      if (res.success) {
        setDoctors(res.data.doctors);
      }
    } catch (err) {
      console.error('Failed to load doctors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [selectedSpecialty, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDoctors();
  };

  const openCreateModal = () => {
    setEditingDoctor(null);
    setErrorMsg('');
    setSuccessMsg('');
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      specialty: 'Cardiology',
      consultationFee: 75,
      slotDurationMinutes: 30,
      bufferMinutes: 0,
      bio: '',
      workingHours: [
        { dayOfWeek: 1, enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 4, enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 5, enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 6, enabled: false, startTime: '09:00', endTime: '13:00' },
        { dayOfWeek: 0, enabled: false, startTime: '09:00', endTime: '13:00' },
      ],
    });
    setShowModal(true);
  };

  const openEditModal = (doc) => {
    setEditingDoctor(doc);
    setErrorMsg('');
    setSuccessMsg('');

    // Map existing working hours into our 7-day grid format
    const existingHoursMap = {};
    (doc.workingHours || []).forEach((wh) => {
      existingHoursMap[wh.dayOfWeek] = wh;
    });

    const grid = DAYS.map((d) => {
      const existing = existingHoursMap[d.id];
      return {
        dayOfWeek: d.id,
        enabled: !!existing,
        startTime: existing?.startTime || '09:00',
        endTime: existing?.endTime || '17:00',
      };
    });

    setFormData({
      name: doc.userId?.name || '',
      email: doc.userId?.email || '',
      phone: doc.userId?.phone || '',
      password: '',
      specialty: doc.specialty || 'General Practice',
      consultationFee: doc.consultationFee || 50,
      slotDurationMinutes: doc.slotDurationMinutes || 30,
      bufferMinutes: doc.bufferMinutes || 0,
      bio: doc.bio || '',
      workingHours: grid,
    });
    setShowModal(true);
  };

  const handleWorkingHourToggle = (dayId) => {
    setFormData((prev) => ({
      ...prev,
      workingHours: prev.workingHours.map((wh) =>
        wh.dayOfWeek === dayId ? { ...wh, enabled: !wh.enabled } : wh
      ),
    }));
  };

  const handleWorkingHourChange = (dayId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      workingHours: prev.workingHours.map((wh) =>
        wh.dayOfWeek === dayId ? { ...wh, [field]: value } : wh
      ),
    }));
  };

  const applyWeekdayTimes = () => {
    const mon = formData.workingHours.find((wh) => wh.dayOfWeek === 1);
    if (!mon) return;

    setFormData((prev) => ({
      ...prev,
      workingHours: prev.workingHours.map((wh) => {
        if ([1, 2, 3, 4, 5].includes(wh.dayOfWeek)) {
          return {
            ...wh,
            enabled: true,
            startTime: mon.startTime,
            endTime: mon.endTime,
          };
        }
        return wh;
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setModalLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Filter out disabled days and include slot duration/buffer
      const formattedWorkingHours = formData.workingHours
        .filter((wh) => wh.enabled)
        .map((wh) => ({
          dayOfWeek: wh.dayOfWeek,
          startTime: wh.startTime,
          endTime: wh.endTime,
          slotDurationMinutes: Number(formData.slotDurationMinutes),
          bufferMinutes: Number(formData.bufferMinutes),
        }));

      if (formattedWorkingHours.length === 0) {
        throw new Error('Please enable at least one working day for the doctor schedule');
      }

      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        specialty: formData.specialty,
        consultationFee: Number(formData.consultationFee),
        slotDurationMinutes: Number(formData.slotDurationMinutes),
        bufferMinutes: Number(formData.bufferMinutes),
        bio: formData.bio,
        workingHours: formattedWorkingHours,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      if (editingDoctor) {
        // Update
        const res = await api.put(`/admin/doctors/${editingDoctor._id}`, payload);
        if (res.success) {
          setSuccessMsg('Doctor profile updated successfully!');
          setTimeout(() => {
            setShowModal(false);
            fetchDoctors();
          }, 1000);
        }
      } else {
        // Create
        const res = await api.post('/admin/doctors', payload);
        if (res.success) {
          setSuccessMsg(
            `Doctor profile created! Temporary credentials queued for email dispatch to ${formData.email}.`
          );
          setTimeout(() => {
            setShowModal(false);
            fetchDoctors();
          }, 1500);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save doctor profile');
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleStatus = async (doctor) => {
    try {
      const res = await api.put(`/admin/doctors/${doctor._id}/toggle-status`);
      if (res.success) {
        fetchDoctors();
      }
    } catch (err) {
      console.error('Error toggling doctor status:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Physician Roster & Schedule Management</h1>
          <p className="text-sm text-slate-500">
            Onboard new physicians, configure weekly availability, slot durations, and buffer times
          </p>
        </div>
        <Button onClick={openCreateModal} className="inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Add New Physician</span>
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search physicians by name or email..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            />
          </form>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white font-medium text-slate-700"
              >
                {SPECIALTIES.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white font-medium text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Deactivated Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Doctors Table */}
      <Card className="overflow-hidden p-0 border border-slate-200">
        {loading ? (
          <div className="py-16">
            <Spinner />
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
              <Stethoscope className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-800">No physicians found</p>
            <p className="text-xs text-slate-500">
              Try adjusting your specialty filters or click "Add New Physician" to onboard a doctor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Physician</th>
                  <th className="p-4">Specialty</th>
                  <th className="p-4">Fee (₹)</th>
                  <th className="p-4">Slot & Buffer</th>
                  <th className="p-4">Working Days</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((doc) => {
                  const activeDays = (doc.workingHours || []).map((wh) => {
                    const found = DAYS.find((d) => d.id === wh.dayOfWeek);
                    return found?.short || '';
                  });

                  return (
                    <tr key={doc._id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Name & Contact */}
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
                            {doc.userId?.name?.charAt(0) || 'D'}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">Dr. {doc.userId?.name}</p>
                            <p className="text-[11px] text-slate-500">{doc.userId?.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Specialty */}
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100">
                          {doc.specialty}
                        </span>
                      </td>

                      {/* Fee */}
                      <td className="p-4 font-semibold text-slate-800">₹{doc.consultationFee}</td>

                      {/* Slot & Buffer */}
                      <td className="p-4">
                        <div className="space-y-0.5">
                          <span className="font-medium text-slate-800">
                            {doc.slotDurationMinutes || 30} min slots
                          </span>
                          {doc.bufferMinutes > 0 && (
                            <p className="text-[10px] text-slate-400">+{doc.bufferMinutes}m buffer</p>
                          )}
                        </div>
                      </td>

                      {/* Active Days */}
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {activeDays.length > 0 ? (
                            activeDays.map((dayStr, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium"
                              >
                                {dayStr}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No active days</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <Badge variant={doc.isAcceptingAppointments ? 'success' : 'danger'}>
                          {doc.isAcceptingAppointments ? 'Active' : 'Deactivated'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="inline-flex items-center space-x-2">
                          <Button
                            onClick={() => openEditModal(doc)}
                            variant="ghost"
                            size="sm"
                            className="p-1.5 text-slate-600 hover:text-teal-700"
                            title="Edit Schedule & Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleToggleStatus(doc)}
                            variant="ghost"
                            size="sm"
                            className={`p-1.5 ${
                              doc.isAcceptingAppointments
                                ? 'text-rose-500 hover:bg-rose-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={doc.isAcceptingAppointments ? 'Deactivate Doctor' : 'Activate Doctor'}
                          >
                            <Power className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Doctor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingDoctor ? `Edit Profile: Dr. ${formData.name}` : 'Onboard New Physician'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingDoctor
                    ? 'Modify profile credentials and consultation working hours'
                    : 'Create physician account, configure appointment slots, and send login credentials'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700 text-xs">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section 1: Basic Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  1. Physician Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Sarah Mitchell"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Email Address *</label>
                    <input
                      type="email"
                      required
                      disabled={!!editingDoctor}
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      placeholder="doctor@vibehealth.dev"
                      className={`w-full px-3 py-2 border rounded-xl text-xs ${
                        editingDoctor
                          ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-50 border-slate-200 focus:bg-white'
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Specialisation *</label>
                    <input
                      type="text"
                      required
                      value={formData.specialty}
                      onChange={(e) => setFormData((p) => ({ ...p, specialty: e.target.value }))}
                      placeholder="e.g. Dermatology, Cardiology"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Consultation Fee (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={formData.consultationFee}
                      onChange={(e) => setFormData((p) => ({ ...p, consultationFee: e.target.value }))}
                      placeholder="75"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      {editingDoctor ? 'Set New Password (Optional)' : 'Initial Password (Auto-generated if blank)'}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                      placeholder={editingDoctor ? 'Leave blank to keep existing' : 'e.g. DocSecure123!'}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Slot Duration & Buffer Configuration */}
              <div className="space-y-3 pt-2 border-t">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  2. Consultation Slot & Buffer Settings
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Slot Duration (Minutes)</label>
                    <select
                      value={formData.slotDurationMinutes}
                      onChange={(e) => setFormData((p) => ({ ...p, slotDurationMinutes: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                    >
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes (Fast triage)</option>
                      <option value={20}>20 minutes</option>
                      <option value={30}>30 minutes (Standard)</option>
                      <option value={45}>45 minutes (Comprehensive)</option>
                      <option value={60}>60 minutes (Specialized)</option>
                    </select>
                    <p className="text-[10px] text-slate-500">Length of each patient encounter slot</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Buffer Between Slots (Minutes)</label>
                    <select
                      value={formData.bufferMinutes}
                      onChange={(e) => setFormData((p) => ({ ...p, bufferMinutes: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                    >
                      <option value={0}>0 minutes (Back-to-back)</option>
                      <option value={5}>5 minutes buffer</option>
                      <option value={10}>10 minutes buffer</option>
                      <option value={15}>15 minutes buffer</option>
                    </select>
                    <p className="text-[10px] text-slate-500">Rest or note-taking interval between appointments</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Weekly Working Hours Grid */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    3. Weekly Schedule Grid
                  </h4>
                  <button
                    type="button"
                    onClick={applyWeekdayTimes}
                    className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 underline"
                  >
                    Copy Monday times to all weekdays
                  </button>
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  {DAYS.map((day) => {
                    const row = formData.workingHours.find((wh) => wh.dayOfWeek === day.id);
                    const isEnabled = row?.enabled;

                    return (
                      <div
                        key={day.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors ${
                          isEnabled ? 'bg-white border-teal-200' : 'bg-slate-100/70 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center space-x-3 sm:w-36">
                          <input
                            type="checkbox"
                            id={`day-${day.id}`}
                            checked={isEnabled}
                            onChange={() => handleWorkingHourToggle(day.id)}
                            className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                          />
                          <label
                            htmlFor={`day-${day.id}`}
                            className="text-xs font-semibold text-slate-800 cursor-pointer select-none"
                          >
                            {day.name}
                          </label>
                        </div>

                        {isEnabled ? (
                          <div className="flex items-center space-x-2 text-xs">
                            <div className="flex items-center space-x-1">
                              <span className="text-slate-400 text-[11px]">Start:</span>
                              <input
                                type="time"
                                required
                                value={row.startTime}
                                onChange={(e) => handleWorkingHourChange(day.id, 'startTime', e.target.value)}
                                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                              />
                            </div>
                            <span className="text-slate-400">to</span>
                            <div className="flex items-center space-x-1">
                              <span className="text-slate-400 text-[11px]">End:</span>
                              <input
                                type="time"
                                required
                                value={row.endTime}
                                onChange={(e) => handleWorkingHourChange(day.id, 'endTime', e.target.value)}
                                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Off duty / Unavailable</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-3 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={modalLoading}>
                  {editingDoctor ? 'Save Changes' : 'Create Physician Profile'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
