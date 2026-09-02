import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectDatabase } from './infrastructure/database/prisma.js';
import { disconnectRedis } from './infrastructure/redis/redis.client.js';

async function startServer() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 API Server running on http://${env.HOST}:${env.PORT}`);
    logger.info(`📚 Swagger Documentation available at http://${env.HOST}:${env.PORT}/docs`);
    logger.info(`💓 Health check endpoint at http://${env.HOST}:${env.PORT}/health`);
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start API server');
    process.exit(1);
  }

  // Graceful Shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      try {
        await app.close();
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });
  }
}

startServer();
