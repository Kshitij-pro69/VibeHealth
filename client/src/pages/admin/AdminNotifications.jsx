import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  Mail,
  Ban,
} from 'lucide-react';

export const AdminNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState({ total: 0, sent: 0, pending: 0, failed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [retryingIds, setRetryingIds] = useState({}); // { [id]: boolean }
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });

  const fetchNotificationLogs = async (targetPage = page, targetTab = activeTab, targetSearch = search) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: targetPage,
        limit: 15,
        deliveryStatus: targetTab,
      });
      if (targetSearch.trim()) params.append('search', targetSearch.trim());

      const res = await api.get(`/admin/notifications?${params.toString()}`);
      if (res.success) {
        setNotifications(res.data.notifications);
        setCounts(res.data.counts);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch notification logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotificationLogs(1, activeTab, search);
    setPage(1);
    // Poll logs every 10 seconds to update delivery status in real-time
    const interval = setInterval(() => {
      fetchNotificationLogs(page, activeTab, search);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchNotificationLogs(1, activeTab, search);
  };

  const handleRetry = async (id) => {
    setRetryingIds((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await api.post(`/admin/notifications/${id}/retry`);
      if (res.success) {
        // Optimistically update local notification status to pending
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === id
              ? { ...n, deliveryStatus: 'pending', attempts: 0, lastError: null }
              : n
          )
        );
        fetchNotificationLogs(page, activeTab, search);
      }
    } catch (err) {
      console.error('Failed to retry notification:', err);
    } finally {
      setRetryingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  const statusBadgeVariant = (status) => {
    if (status === 'sent') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'failed') return 'danger';
    return 'default';
  };

  const statusIcon = (status) => {
    if (status === 'sent') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (status === 'pending') return <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />;
    if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
    return <Ban className="w-3.5 h-3.5 text-slate-400" />;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notification Reliability & Delivery Log</h1>
          <p className="text-sm text-slate-500">
            Real-time audit tracking, BullMQ retry state monitoring, and manual dispatch control
          </p>
        </div>
        <Button onClick={() => fetchNotificationLogs(page, activeTab, search)} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Log
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setActiveTab('all')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === 'all' ? 'bg-teal-50 border-teal-300 ring-2 ring-teal-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Logged</span>
            <Bell className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{counts.total}</p>
        </div>

        <div
          onClick={() => setActiveTab('sent')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === 'sent' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-900 mt-2">{counts.sent}</p>
        </div>

        <div
          onClick={() => setActiveTab('pending')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === 'pending' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Pending / Retry</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-2">{counts.pending}</p>
        </div>

        <div
          onClick={() => setActiveTab('failed')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === 'failed' ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700">Failed (3x)</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-900 mt-2">{counts.failed}</p>
        </div>

        <div
          onClick={() => setActiveTab('cancelled')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === 'cancelled' ? 'bg-slate-100 border-slate-300 ring-2 ring-slate-400/20' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Cancelled (24h)</span>
            <Ban className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{counts.cancelled}</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['all', 'failed', 'pending', 'sent', 'cancelled'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition ${
                activeTab === tab
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 w-full sm:w-80">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search recipient, title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </Card>

      {/* Audit Log Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Spinner />
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Mail className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">No notification log records match this filter</p>
            <p className="text-xs text-slate-400">Outbound email dispatches will automatically populate here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4">Delivery Status</th>
                  <th className="p-4">Recipient Email</th>
                  <th className="p-4">Email Type & Subject</th>
                  <th className="p-4">Attempts</th>
                  <th className="p-4">Created / Sent At</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {notifications.map((n) => (
                  <tr key={n._id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        {statusIcon(n.deliveryStatus)}
                        <Badge variant={statusBadgeVariant(n.deliveryStatus)}>
                          {n.deliveryStatus?.toUpperCase()}
                        </Badge>
                      </div>
                    </td>

                    <td className="p-4 font-semibold text-slate-900">
                      {n.recipientEmail || '—'}
                    </td>

                    <td className="p-4 space-y-0.5 max-w-xs">
                      <p className="font-semibold text-slate-800 truncate">{n.title}</p>
                      <p className="text-[10px] text-teal-700 font-mono bg-teal-50 inline-block px-1.5 py-0.5 rounded">
                        {n.emailType}
                      </p>
                      {n.lastError && (
                        <p className="text-[10px] text-rose-600 bg-rose-50 p-1.5 rounded border border-rose-100 mt-1 font-mono break-all">
                          {n.lastError}
                        </p>
                      )}
                    </td>

                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        n.attempts >= 3 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {n.attempts || 0} / 3
                      </span>
                    </td>

                    <td className="p-4 text-slate-500 text-[11px] space-y-0.5">
                      <p>Created: {new Date(n.createdAt).toLocaleTimeString()}</p>
                      {n.sentAt && <p className="text-emerald-600">Sent: {new Date(n.sentAt).toLocaleTimeString()}</p>}
                    </td>

                    <td className="p-4 text-right">
                      {n.deliveryStatus === 'failed' ? (
                        <Button
                          onClick={() => handleRetry(n._id)}
                          variant="outline"
                          size="sm"
                          isLoading={retryingIds[n._id]}
                          className="border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry Delivery
                        </Button>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
