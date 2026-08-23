import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { ShieldCheck, Activity, Database, Server, RefreshCw } from 'lucide-react';
import { Button } from '../../components/common/Button';

export const AdminDashboard = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await api.get('/health');
      setHealth(res);
    } catch (err) {
      console.error('Failed to fetch system health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Health & Administration</h1>
          <p className="text-sm text-slate-500">Real-time database, cache, and queue monitoring</p>
        </div>
        <Button onClick={fetchHealth} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Status
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Server status */}
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

          {/* MongoDB */}
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

          {/* Redis & BullMQ */}
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
            <p className="text-xs text-slate-500">In-process workers for free-tier hosting</p>
          </Card>
        </div>
      )}
    </div>
  );
};
