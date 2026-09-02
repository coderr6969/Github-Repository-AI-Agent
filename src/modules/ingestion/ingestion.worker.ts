import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../../infrastructure/redis/redis.client.js';
import { logger } from '../../config/logger.js';
import { INGESTION_QUEUE_NAME } from '../../infrastructure/queue/ingestion.queue.js';
import { IngestionJobData } from '../../infrastructure/queue/queue.interface.js';
import { ingestionService } from './ingestion.service.js';

let workerInstance: Worker<IngestionJobData> | null = null;

export function startIngestionWorker(): Worker<IngestionJobData> {
  if (!workerInstance) {
    const redis = getRedisClient();

    workerInstance = new Worker<IngestionJobData>(
      INGESTION_QUEUE_NAME,
      async (job: Job<IngestionJobData>) => {
        logger.info({ jobId: job.id, data: job.data }, 'BullMQ Worker processing ingestion job');
        await ingestionService.processRepository(job.data.repositoryId);
      },
      {
        connection: redis,
        concurrency: 2,
      }
    );

    workerInstance.on('completed', (job) => {
      logger.info({ jobId: job.id, repo: job.data.repositoryId }, 'Ingestion worker completed job');
    });

    workerInstance.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, repo: job?.data?.repositoryId, err }, 'Ingestion worker job failed');
    });

    workerInstance.on('error', (err) => {
      logger.error({ err }, 'Ingestion worker encountered an error');
    });

    logger.info('BullMQ Repository Ingestion Worker initialized and listening');
  }

  return workerInstance;
}

export async function stopIngestionWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info('BullMQ Ingestion Worker stopped');
  }
}
