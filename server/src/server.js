import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { connectDB, closeDB } from './config/db.js';
import { connectRedis, closeRedis } from './config/redis.js';
import { startWorkers, stopWorkers } from './jobs/worker.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const app = express();

// Middleware
app.use(
  cors({
    origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request logging in development
if (config.env === 'development') {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.originalUrl}`);
    next();
  });
}

// Mount API Routes
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

// Root Welcome / Health Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'VibeHealth API',
    version: '1.0.0',
    status: 'online',
    docs: '/api/v1/health',
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found`,
    error: { code: 'NOT_FOUND' },
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Server Boot Sequence
let serverInstance = null;

const startServer = async () => {
  try {
    logger.info('🚀 Starting VibeHealth Backend Server...');

    // 1. Connect to MongoDB
    await connectDB();

    // 2. Connect to Redis
    await connectRedis();

    // 3. Start In-Process BullMQ Background Workers
    startWorkers();

    // 4. Start HTTP Server
    serverInstance = app.listen(config.port, () => {
      logger.info(`✅ Server listening on port ${config.port} (${config.env})`);
      logger.info(`🔗 API Root: ${config.serverUrl}/api/v1`);
      logger.info(`🩺 Health Check: ${config.serverUrl}/api/v1/health`);
    });
  } catch (err) {
    logger.error('❌ Failed to start server:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

// Graceful Shutdown Handler
const gracefulShutdown = async (signal) => {
  logger.info(`\nReceived ${signal}. Shutting down gracefully...`);

  if (serverInstance) {
    serverInstance.close(() => {
      logger.info('HTTP server closed.');
    });
  }

  try {
    await stopWorkers();
    await closeRedis();
    await closeDB();
    logger.info('All database connections and queues closed. Exiting process.');
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown:', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export default app;
