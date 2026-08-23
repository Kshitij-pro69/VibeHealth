import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import {
  Calendar,
  AlertTriangle,
  Trash2,
  Plus,
  Info,
  CheckCircle2,
  Clock,
  User,
  X,
  ShieldAlert,
} from 'lucide-react';

export const DoctorLeaves = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Conflict modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictingAppts, setConflictingAppts] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Leave deletion modal state
  const [deleteModalLeave, setDeleteModalLeave] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const res = await api.get('/doctors/leave');
      if (res.success) {
        setLeaves(res.data.leaves || []);
      }
    } catch (err) {
      console.error('Failed to fetch leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  // Step 1: Preview conflicts before submitting
  const handlePreviewConflicts = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    if (new Date(startDate) > new Date(endDate)) {
      setError('End date must be equal to or after start date.');
      return;
    }

    setPreviewLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await api.post('/doctors/leave/preview', {
        startDate,
        endDate,
      });

      if (res.success) {
        const conflicts = res.data.appointments || [];
        if (conflicts.length > 0) {
          setConflictingAppts(conflicts);
          setConflictModalOpen(true);
        } else {
          // Zero conflicts: execute direct creation
          await executeLeaveCreation(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to inspect schedule conflicts.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Step 2: Execute leave creation (with or without override)
  const executeLeaveCreation = async (confirmCancelBookings) => {
    setSubmitting(true);
    setError('');

    try {
      const res = await api.post('/doctors/leave', {
        startDate,
        endDate,
        reason,
        confirmCancelBookings,
      });

      if (res.success) {
        setConflictModalOpen(false);
        setConflictingAppts([]);
        setStartDate('');
        setEndDate('');
        setReason('');

        const cancelledCount = res.data.cancelledAppointmentsCount || 0;
        setSuccessMsg(
          cancelledCount > 0
            ? `Leave recorded successfully. ${cancelledCount} appointment(s) cancelled and patients notified.`
            : 'Leave recorded successfully with zero schedule conflicts.'
        );
        fetchLeaves();
      }
    } catch (err) {
      // If 409 returned with requiresConfirmation flag
      if (err.data?.requiresConfirmation || err.requiresConfirmation) {
        setConflictingAppts(err.data?.appointments || err.appointments || []);
        setConflictModalOpen(true);
      } else {
        setError(err.message || 'Could not record leave schedule.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle deletion of leave schedule
  const handleDeleteLeave = async () => {
    if (!deleteModalLeave) return;
    setDeleting(true);
    setError('');

    try {
      const res = await api.delete(`/doctors/leave/${deleteModalLeave._id}`);
      if (res.success) {
        setDeleteModalLeave(null);
        setSuccessMsg('Leave schedule removed. Note: Previously cancelled appointments remain cancelled.');
        fetchLeaves();
      }
    } catch (err) {
      setError(err.message || 'Failed to remove leave record.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const formatTime = (dateStr) =>
    new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Schedule & Time Off</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mark single-day or multi-day leaves. Conflicting bookings will trigger an explicit confirmation warning before cancelling.
        </p>
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Request Leave Form Card */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-teal-600" />
          Schedule New Leave / Time Off
        </h2>

        <form onSubmit={handlePreviewConflicts} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Start Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              End Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white"
            />
          </div>

          <div className="space-y-1.5 md:col-span-3">
            <label className="text-xs font-semibold text-slate-700">Reason (Optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Attending Annual Medical Conference, Personal Medical Leave"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white"
            />
          </div>

          <div className="md:col-span-3 pt-2">
            <Button type="submit" isLoading={previewLoading || submitting} className="w-full sm:w-auto">
              Check Schedule Conflicts & Submit Leave
            </Button>
          </div>
        </form>
      </Card>

      {/* Active & Past Leaves Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Your Scheduled Leaves</h2>

        {loading ? (
          <Spinner />
        ) : leaves.length === 0 ? (
          <Card className="text-center py-12 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-800">No scheduled leaves</p>
            <p className="text-xs text-slate-500">Your practice schedule is currently active for all working hours.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="p-4">Date Window</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-50/50 transition">
                    <td className="p-4 font-semibold text-slate-800">
                      {formatDate(l.startDate)} — {formatDate(l.endDate)}
                    </td>
                    <td className="p-4 text-slate-600">{l.reason || 'No reason specified'}</td>
                    <td className="p-4">
                      <Badge variant="success">Approved</Badge>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setDeleteModalLeave(l)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Remove leave schedule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Mandatory Conflict Confirmation Modal */}
      {conflictModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 border-amber-200">
            <div className="flex items-start justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Schedule Conflict Warning</h3>
                  <p className="text-xs text-slate-500">
                    Existing bookings detected during requested leave window
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConflictModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alert Message */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-900">
              <p className="font-bold">
                ⚠️ You have {conflictingAppts.length} confirmed appointment(s) on these dates.
              </p>
              <p className="text-amber-700">
                Marking leave will immediately cancel these bookings, release the slots, and dispatch notification emails + in-app alerts to affected patients.
              </p>
            </div>

            {/* List of Affected Appointments */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Affected Patient Bookings ({conflictingAppts.length})
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 p-1">
                {conflictingAppts.map((apt) => (
                  <div key={apt._id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {apt.patientId?.name || apt.patientName || 'Patient'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatDate(apt.startTime)} at {formatTime(apt.startTime)}
                      </p>
                    </div>
                    <Badge variant="warning">Confirmed</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConflictModalOpen(false)}
              >
                Cancel Request
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                isLoading={submitting}
                onClick={() => executeLeaveCreation(true)}
              >
                Confirm Leave & Cancel {conflictingAppts.length} Booking(s)
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Leave Safeguard Confirmation Modal */}
      {deleteModalLeave && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 space-y-5">
            <div className="flex items-center gap-3 border-b pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Remove Leave Schedule</h3>
                <p className="text-xs text-slate-500">Confirm schedule deletion</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                Are you sure you want to remove the leave for{' '}
                <strong>
                  {formatDate(deleteModalLeave.startDate)} — {formatDate(deleteModalLeave.endDate)}
                </strong>
                ?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  Important Safeguard Notice:
                </p>
                <p>
                  Removing this leave will re-open future slot availability on these dates, but will <strong>NOT</strong> restore previously cancelled appointments.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteModalLeave(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                isLoading={deleting}
                onClick={handleDeleteLeave}
              >
                Remove Leave
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
