import Redis from 'ioredis';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

let redisClient = null;

export const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis reconnect attempt #${times} in ${delay}ms`);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Redis connection initialized');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', { error: err.message });
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
};

export const connectRedis = async () => {
  const client = getRedisClient();
  if (client.status !== 'ready' && client.status !== 'connecting' && client.status !== 'connect') {
    try {
      await client.connect();
    } catch (err) {
      logger.error('Initial Redis connection failed:', { error: err.message });
      throw err;
    }
  }
  return client;
};

export const getRedisStatus = async () => {
  const client = getRedisClient();
  const status = client.status;
  let isHealthy = false;

  if (status === 'ready') {
    try {
      const pong = await client.ping();
      isHealthy = pong === 'PONG';
    } catch (e) {
      isHealthy = false;
    }
  }

  return {
    status,
    isHealthy,
  };
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed gracefully');
  }
};
