import { getDBStatus } from '../config/db.js';
import { getRedisStatus } from '../config/redis.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const getHealthStatus = async (req, res) => {
  const dbStatus = getDBStatus();
  const redisStatus = await getRedisStatus();

  const isHealthy = dbStatus.isConnected && redisStatus.isHealthy;

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    timestamp: new Date().toISOString(),
    status: isHealthy ? 'healthy' : 'degraded',
    services: {
      mongo: dbStatus,
      redis: redisStatus,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
};
