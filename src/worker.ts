import { startIngestionWorker, stopIngestionWorker } from './modules/ingestion/ingestion.worker.js';
import { logger } from './config/logger.js';
import { disconnectDatabase } from './infrastructure/database/prisma.js';
import { disconnectRedis } from './infrastructure/redis/redis.client.js';

async function runWorker() {
  logger.info('⚡ Starting Background Ingestion Worker process...');

  try {
    startIngestionWorker();
    logger.info('✅ Ingestion Worker process is actively listening for jobs');
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start BullMQ ingestion worker');
    process.exit(1);
  }

  // Graceful Shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Worker received ${signal}, shutting down gracefully...`);
      try {
        await stopIngestionWorker();
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Ingestion Worker shutdown completed');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error shutting down ingestion worker');
        process.exit(1);
      }
    });
  }
}

runWorker();
