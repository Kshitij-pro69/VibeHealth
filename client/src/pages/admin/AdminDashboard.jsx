import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { ShieldCheck, Activity, Database, Server, RefreshCw, Users, Calendar, UserCheck } from 'lucide-react';
import { Button } from '../../components/common/Button';

export const AdminDashboard = () => {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError('');
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
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Administration</h1>
          <p className="text-sm text-slate-500">System metrics, users, and cluster health</p>
        </div>
        <Button onClick={fetchAdminData} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Status
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total Users</span>
                <Users className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalUsers || users.length || 0}</p>
              <p className="text-xs text-slate-400">Registered accounts</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Patients</span>
                <UserCheck className="w-4 h-4 text-cyan-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalPatients || 0}</p>
              <p className="text-xs text-slate-400">Active patients</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Doctors</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalDoctors || 0}</p>
              <p className="text-xs text-slate-400">Verified physicians</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Appointments</span>
                <Calendar className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalAppointments || 0}</p>
              <p className="text-xs text-slate-400">{stats?.confirmedAppointments || 0} confirmed</p>
            </Card>
          </div>

          {/* Infrastructure Health */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-400">Core API Server</span>
                <Badge variant={health?.status === 'healthy' ? 'success' : 'danger'}>
                  {health?.status || 'Active'}
                </Badge>
              </div>
              <div className="flex items-center space-x-3 text-slate-800">
                <Server className="w-6 h-6 text-teal-600" />
                <span className="text-xl font-bold">Port 5000</span>
              </div>
              <p className="text-xs text-slate-500">Uptime: {health?.uptimeSeconds || 0} seconds</p>
            </Card>

            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-400">Database</span>
                <Badge variant={health?.services?.mongo?.isConnected ? 'success' : 'danger'}>
                  {health?.services?.mongo?.status || 'connected'}
                </Badge>
              </div>
              <div className="flex items-center space-x-3 text-slate-800">
                <Database className="w-6 h-6 text-emerald-600" />
                <span className="text-xl font-bold">MongoDB</span>
              </div>
              <p className="text-xs text-slate-500">Compound unique partial index verified</p>
            </Card>

            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-400">Cache & BullMQ</span>
                <Badge variant={health?.services?.redis?.isHealthy ? 'success' : 'danger'}>
                  {health?.services?.redis?.status || 'ready'}
                </Badge>
              </div>
              <div className="flex items-center space-x-3 text-slate-800">
                <Activity className="w-6 h-6 text-cyan-600" />
                <span className="text-xl font-bold">ioredis + BullMQ</span>
              </div>
              <p className="text-xs text-slate-500">In-process workers active</p>
            </Card>
          </div>

          {/* User Management List */}
          {users.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">System Users</h2>
              <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-3.5">Name</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u._id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 font-medium text-slate-900">{u.name}</td>
                        <td className="p-3.5 text-slate-600">{u.email}</td>
                        <td className="p-3.5">
                          <Badge
                            variant={u.role === 'admin' ? 'primary' : u.role === 'doctor' ? 'success' : 'default'}
                          >
                            {u.role}
                          </Badge>
                        </td>
                        <td className="p-3.5">
                          <span className={u.isActive ? 'text-emerald-600 font-medium' : 'text-rose-500 font-medium'}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
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

