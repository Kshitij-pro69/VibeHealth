import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { Button } from '../../components/common/Button';
import {
  ShieldCheck,
  Activity,
  Database,
  Server,
  RefreshCw,
  Users,
  Calendar,
  UserCheck,
  AlertTriangle,
  BarChart3,
  TrendingDown,
  Stethoscope,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const AdminDashboard = () => {
  const { addToast } = useToast();
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState({});

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [healthRes, statsRes, usersRes] = await Promise.allSettled([
        api.get('/health'),
        api.get('/admin/stats'),
        api.get('/admin/users'),
      ]);

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value?.data?.stats);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value?.data?.users || []);
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleToggleUser = async (userId, currentActive) => {
    setToggleLoading((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await api.patch(`/admin/users/${userId}/toggle-status`);
      if (res.success) {
        addToast(
          `User account ${currentActive ? 'deactivated' : 'activated'} successfully!`,
          currentActive ? 'warning' : 'success'
        );
        fetchAdminData();
      }
    } catch (err) {
      addToast(err.message || 'Failed to toggle user status.', 'danger');
    } finally {
      setToggleLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white">
              Admin Portal
            </span>
            <span className="text-xs text-slate-400">System Monitoring & Analytics</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Platform Operations</h1>
        </div>
        <Button onClick={fetchAdminData} variant="outline" size="sm" className="shrink-0">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Metrics
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Spinner size="lg" />
          <p className="text-xs text-slate-400 mt-2">Loading platform analytics & metrics...</p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total Users</span>
                <Users className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalUsers || users.length || 0}</p>
              <p className="text-xs text-slate-400">Registered platform accounts</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Patients</span>
                <UserCheck className="w-4 h-4 text-cyan-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalPatients || 0}</p>
              <p className="text-xs text-slate-400">Registered patient accounts</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Physicians</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalDoctors || 0}</p>
              <p className="text-xs text-slate-400">Active medical profiles</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Appointments</span>
                <Calendar className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalAppointments || 0}</p>
              <p className="text-xs text-slate-400">{stats?.confirmedAppointments || 0} confirmed / {stats?.completedAppointments || 0} completed</p>
            </Card>

            <Card className="p-5 space-y-2 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase">Cancellation Rate</span>
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-2xl font-bold text-white">{stats?.cancellationRatePercent || 0}%</p>
              <p className="text-xs text-slate-400">{stats?.cancelledAppointments || 0} total cancellations</p>
            </Card>
          </div>

          {/* Infrastructure Cluster Health */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-600" />
              Infrastructure Cluster Health
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-400">Core API Server</span>
                  <Badge variant={health?.status === 'healthy' ? 'success' : 'danger'}>
                    {health?.status || 'Active'}
                  </Badge>
                </div>
                <div className="flex items-center space-x-3 text-slate-800">
                  <Server className="w-6 h-6 text-teal-600 shrink-0" />
                  <div>
                    <span className="text-lg font-bold">Node.js / Express</span>
                    <p className="text-xs text-slate-500">Uptime: {health?.uptimeSeconds || 0} seconds</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-400">Database Cluster</span>
                  <Badge variant={health?.services?.mongo?.isConnected ? 'success' : 'danger'}>
                    {health?.services?.mongo?.status || 'connected'}
                  </Badge>
                </div>
                <div className="flex items-center space-x-3 text-slate-800">
                  <Database className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-lg font-bold">MongoDB Atlas</span>
                    <p className="text-xs text-slate-500">Compound unique indexes active</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-400">Cache & Queues</span>
                  <Badge variant={health?.services?.redis?.isHealthy ? 'success' : 'danger'}>
                    {health?.services?.redis?.status || 'ready'}
                  </Badge>
                </div>
                <div className="flex items-center space-x-3 text-slate-800">
                  <Activity className="w-6 h-6 text-cyan-600 shrink-0" />
                  <div>
                    <span className="text-lg font-bold">ioredis + BullMQ</span>
                    <p className="text-xs text-slate-500">In-process background workers active</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Appointments per Doctor Breakdown */}
          {stats?.appointmentsPerDoctor?.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-600" />
                Appointments Per Physician
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.appointmentsPerDoctor.map((item, idx) => (
                  <Card key={idx} className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
                        {item.doctorName?.charAt(0) || 'D'}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">Dr. {item.doctorName || 'Physician'}</h4>
                        <p className="text-[11px] text-slate-400">{item.doctorEmail}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-teal-700">{item.count}</span>
                      <p className="text-[10px] text-slate-400 uppercase">Consults</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* User Management List */}
          {users.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                System Users & Account Management
              </h2>

              <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-3.5">Name</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u._id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 font-bold text-slate-900">{u.name}</td>
                        <td className="p-3.5 text-slate-600">{u.email}</td>
                        <td className="p-3.5">
                          <Badge
                            variant={u.role === 'admin' ? 'primary' : u.role === 'doctor' ? 'success' : 'default'}
                          >
                            {u.role.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3.5">
                          <span className={u.isActive ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <Button
                            onClick={() => handleToggleUser(u._id, u.isActive)}
                            isLoading={toggleLoading[u._id]}
                            variant="outline"
                            size="sm"
                            className={`text-xs ${
                              u.isActive
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
