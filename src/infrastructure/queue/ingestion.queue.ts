import { Queue } from 'bullmq';
import { getRedisClient } from '../redis/redis.client.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { IIngestionQueue, IngestionJobData } from './queue.interface.js';

export const INGESTION_QUEUE_NAME = 'repository-ingestion';

let ingestionQueueInstance: Queue<IngestionJobData> | null = null;

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!ingestionQueueInstance) {
    const redis = getRedisClient();
    ingestionQueueInstance = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });

    ingestionQueueInstance.on('error', (err) => {
      logger.error({ err }, 'BullMQ Ingestion Queue error');
    });
  }
  return ingestionQueueInstance;
}

export class IngestionQueueService implements IIngestionQueue {
  private queue: Queue<IngestionJobData>;

  constructor(queue?: Queue<IngestionJobData>) {
    this.queue = queue || getIngestionQueue();
  }

  async addJob(data: IngestionJobData): Promise<string> {
    const job = await this.queue.add('ingest-repo', data, {
      jobId: `ingest_${data.repositoryId}_${Date.now()}`,
    });
    logger.info({ jobId: job.id, repositoryId: data.repositoryId }, 'Ingestion job added to queue');
    return job.id || data.repositoryId;
  }

  async getJob(jobId: string): Promise<unknown | null> {
    return this.queue.getJob(jobId);
  }

  async close(): Promise<void> {
    if (ingestionQueueInstance) {
      await ingestionQueueInstance.close();
      ingestionQueueInstance = null;
    }
  }
}

// In-Memory Queue for test execution without requiring Redis
export class InMemoryIngestionQueue implements IIngestionQueue {
  public jobs: Array<{ id: string; data: IngestionJobData }> = [];

  async addJob(data: IngestionJobData): Promise<string> {
    const id = `mock_job_${Date.now()}_${data.repositoryId}`;
    this.jobs.push({ id, data });
    return id;
  }

  async getJob(jobId: string): Promise<unknown | null> {
    return this.jobs.find((j) => j.id === jobId) || null;
  }

  async close(): Promise<void> {}
}

export const ingestionQueue: IIngestionQueue =
  env.NODE_ENV === 'test' ? new InMemoryIngestionQueue() : new IngestionQueueService();
