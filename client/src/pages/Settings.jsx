import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  LogOut,
  User,
  Mail,
  Phone,
} from 'lucide-react';

export const Settings = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [calendarStatus, setCalendarStatus] = useState('not_connected');
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [alertMessage, setAlertMessage] = useState(null);

  const fetchCalendarStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/calendar-status');
      if (res.success) {
        setCalendarStatus(res.data.calendarStatus);
      }
    } catch (err) {
      console.error('Failed to fetch calendar status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarStatus();

    // Check query params from Google OAuth callback redirect
    const calParam = searchParams.get('calendar');
    const msgParam = searchParams.get('message');

    if (calParam === 'connected') {
      setAlertMessage({ type: 'success', text: 'Google Calendar successfully connected!' });
      setCalendarStatus('connected');
    } else if (calParam === 'error') {
      setAlertMessage({ type: 'danger', text: `Google Calendar connection failed: ${msgParam || 'Authorization error'}` });
    }
  }, [searchParams]);

  const handleConnectGoogle = () => {
    const token = localStorage.getItem('vibehealth_token');
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    window.location.href = `${backendUrl}/auth/google?token=${encodeURIComponent(token)}`;
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Calendar?')) return;
    setDisconnecting(true);
    try {
      const res = await api.post('/auth/disconnect-calendar');
      if (res.success) {
        setCalendarStatus('not_connected');
        setAlertMessage({ type: 'info', text: 'Google Calendar disconnected.' });
      }
    } catch (err) {
      console.error('Failed to disconnect Google Calendar:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account & Preferences</h1>
        <p className="text-sm text-slate-500">
          Manage your personal profile and calendar integration settings
        </p>
      </div>

      {alertMessage && (
        <div
          className={`p-4 rounded-2xl border text-sm flex items-center justify-between ${
            alertMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : alertMessage.type === 'danger'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            {alertMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : alertMessage.type === 'danger' ? (
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            ) : (
              <Calendar className="w-5 h-5 text-slate-500" />
            )}
            <span>{alertMessage.text}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile Overview */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center">
          <User className="w-5 h-5 mr-2 text-teal-600" />
          Profile Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase">Full Name</span>
            <p className="font-semibold text-slate-800">{user?.name}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase">Email Address</span>
            <p className="font-semibold text-slate-800">{user?.email}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase">Role</span>
            <p className="font-semibold capitalize text-teal-700">{user?.role}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase">Account Status</span>
            <Badge variant="success">ACTIVE</Badge>
          </div>
        </div>
      </Card>

      {/* Google Calendar Integration Section */}
      <Card className="p-6 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-teal-600" />
              Google Calendar Sync
            </h2>
            <p className="text-xs text-slate-500 max-w-xl">
              Automatically sync consultation bookings, reschedules, and cancellations directly with your personal Google Calendar.
            </p>
          </div>
          <div>
            {loading ? (
              <Spinner size="sm" />
            ) : calendarStatus === 'connected' ? (
              <Badge variant="success" className="px-3 py-1 text-xs">
                CONNECTED
              </Badge>
            ) : calendarStatus === 'reauth_required' ? (
              <Badge variant="warning" className="px-3 py-1 text-xs">
                RECONNECTION NEEDED
              </Badge>
            ) : (
              <Badge variant="default" className="px-3 py-1 text-xs">
                NOT CONNECTED
              </Badge>
            )}
          </div>
        </div>

        {/* State 1: Connected */}
        {calendarStatus === 'connected' && (
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-emerald-900 text-sm">Google Calendar Active & Connected</h3>
                <p className="text-xs text-emerald-700 mt-1">
                  Your appointments will automatically synchronize with your Google Calendar. You will receive 24-hour email reminders and popup notifications for all scheduled sessions.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-emerald-200/60">
              <span className="text-xs text-emerald-700 font-medium">Scope: https://www.googleapis.com/auth/calendar.events</span>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                isLoading={disconnecting}
                className="border-emerald-300 text-rose-700 hover:bg-rose-50"
              >
                Disconnect Calendar
              </Button>
            </div>
          </div>
        )}

        {/* State 2: Reconnection Needed (invalid_grant token revocation) */}
        {calendarStatus === 'reauth_required' && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 mt-0.5 shrink-0 animate-bounce" />
              <div className="space-y-1">
                <h3 className="font-bold text-amber-900 text-sm">Google Calendar Access Revoked / Expired</h3>
                <p className="text-xs text-amber-800">
                  Google Calendar access was revoked or authorization expired. Please click Reconnect to authorize VibeHealth to synchronize your consultations again.
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleConnectGoogle}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reconnect Google Calendar
              </Button>
            </div>
          </div>
        )}

        {/* State 3: Not Connected */}
        {calendarStatus === 'not_connected' && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start space-x-3">
              <Calendar className="w-6 h-6 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Connect your Google Calendar</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Never miss an appointment. Enable automated synchronization to automatically add booked consultations to your Google Calendar.
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleConnectGoogle}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect Google Calendar
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
