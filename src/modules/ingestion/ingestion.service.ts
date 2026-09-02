import { IngestionStatus, RepositoryStatus } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { CodeChunk } from '../../types/index.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { parseGitHubUrl } from '../../utils/github-url.js';
import { getGitHubClient } from '../github/github.service.js';
import { IGitHubClient } from '../github/github.interface.js';
import { isSupportedSourceFile, detectLanguage } from './file-filter.js';
import { chunkSourceCode } from './chunker.js';
import { getEmbeddingService, IEmbeddingService } from './embeddings.js';
import { qdrantService } from '../../infrastructure/qdrant/qdrant.service.js';
import { IVectorStore } from '../../infrastructure/qdrant/vector-store.interface.js';
import { ingestionRepository, IngestionRepository } from './ingestion.repository.js';
import { repositoryRepository, RepositoryRepository } from '../repositories/repository.repository.js';
import { ingestionQueue } from '../../infrastructure/queue/ingestion.queue.js';
import { IIngestionQueue } from '../../infrastructure/queue/queue.interface.js';
import { metrics, startTimer } from '../../utils/observability.js';

export class IngestionService {
  constructor(
    private repoRepo: RepositoryRepository = repositoryRepository,
    private ingestRepo: IngestionRepository = ingestionRepository,
    private queue: IIngestionQueue = ingestionQueue,
    private githubClient: IGitHubClient = getGitHubClient(),
    private vectorStore: IVectorStore = qdrantService,
    private embeddingService: IEmbeddingService = getEmbeddingService()
  ) {}

  async queueIngestion(repositoryId: string): Promise<{ jobId: string; status: string }> {
    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }

    const { owner, repo: repoName } = parseGitHubUrl(repo.url);
    const job = await this.ingestRepo.createJob(repositoryId);

    await this.repoRepo.updateStatus(repositoryId, RepositoryStatus.QUEUED);

    const queueJobId = await this.queue.addJob({
      repositoryId,
      url: repo.url,
      owner,
      repo: repoName,
      defaultBranch: repo.defaultBranch,
    });

    logger.info({ repositoryId, queueJobId, dbJobId: job.id }, 'Queued repository ingestion');
    return { jobId: job.id, status: 'queued' };
  }

  async processRepository(repositoryId: string, dbJobId?: string): Promise<void> {
    const timer = startTimer();
    logger.info({ repositoryId }, 'Starting repository ingestion worker execution');

    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository ${repositoryId} not found in DB`);
    }

    const activeJob = dbJobId
      ? await this.ingestRepo.getJobById(dbJobId)
      : await this.ingestRepo.getLatestJobByRepositoryId(repositoryId);

    const jobId = activeJob?.id || (await this.ingestRepo.createJob(repositoryId)).id;

    try {
      await this.repoRepo.updateStatus(repositoryId, RepositoryStatus.PROCESSING);
      await this.ingestRepo.updateJob(jobId, {
        status: IngestionStatus.PROCESSING,
        startedAt: new Date(),
      });

      const { owner, repo: repoName } = parseGitHubUrl(repo.url);
      const gh = getGitHubClient();

      // 1. Fetch Repository Metadata
      const repoMeta = await gh.getRepository(owner, repoName);
      const defaultBranch = repoMeta.defaultBranch || repo.defaultBranch || 'main';

      if (repoMeta.description && repoMeta.description !== repo.description) {
        await this.repoRepo.updateMetadata(repositoryId, {
          description: repoMeta.description,
          defaultBranch,
        });
      }

      // 2. Fetch Recursive Git Tree
      logger.info({ repositoryId, owner, repoName, defaultBranch }, 'Fetching git tree');
      const treeItems = await gh.getTree(owner, repoName, defaultBranch, true);

      // 3. Filter Supported Source Files
      const supportedFiles = treeItems.filter(
        (item) => item.type === 'blob' && isSupportedSourceFile(item.path)
      );

      logger.info(
        { repositoryId, totalTreeItems: treeItems.length, supportedFiles: supportedFiles.length },
        'Filtered source files for ingestion'
      );

      // Guard against massive repos for MVP
      const maxFiles = env.MAX_FILES_PER_REPO;
      const targetFiles = supportedFiles.slice(0, maxFiles);

      await this.ingestRepo.updateJob(jobId, {
        totalFiles: targetFiles.length,
      });

      // 4. Download files & chunk
      const allChunks: CodeChunk[] = [];
      const savedFilesMetadata: Array<{ path: string; language: string; size: number; sha?: string }> = [];
      let processedCount = 0;
      let failedCount = 0;

      // Process with concurrency limit (e.g. 5 concurrent downloads)
      const concurrency = 5;
      for (let i = 0; i < targetFiles.length; i += concurrency) {
        const batch = targetFiles.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map(async (item) => {
            const fileData = await gh.getFile(owner, repoName, item.path, defaultBranch);
            const language = detectLanguage(item.path);
            const chunks = chunkSourceCode(
              repositoryId,
              item.path,
              language,
              fileData.content,
              defaultBranch
            );
            return {
              fileData,
              language,
              chunks,
            };
          })
        );

        for (const res of results) {
          if (res.status === 'fulfilled') {
            processedCount++;
            allChunks.push(...res.value.chunks);
            savedFilesMetadata.push({
              path: res.value.fileData.path,
              language: res.value.language,
              size: res.value.fileData.size,
              sha: res.value.fileData.sha,
            });
          } else {
            failedCount++;
            logger.warn({ err: res.reason }, 'Failed to fetch/chunk single file');
          }
        }

        // Update progress periodically
        await this.ingestRepo.updateJob(jobId, {
          processedFiles: processedCount,
          failedFiles: failedCount,
          totalChunks: allChunks.length,
        });
      }

      // 5. Generate Embeddings & Upsert to Qdrant
      if (allChunks.length > 0) {
        logger.info(
          { repositoryId, totalChunks: allChunks.length },
          'Generating embeddings and upserting into Qdrant'
        );

        const chunkTexts = allChunks.map((c) => `File: ${c.filePath}\nLanguage: ${c.language}\n\n${c.content}`);
        const embeddings = await this.embeddingService.generateEmbeddings(chunkTexts);

        // Delete previous vectors for this repository for idempotent re-ingestion
        await this.vectorStore.deleteByRepositoryId(repositoryId);
        await this.vectorStore.upsertChunks(allChunks, embeddings);
      }

      // 6. Save File Metadata in PostgreSQL
      await this.ingestRepo.saveRepositoryFiles(repositoryId, savedFilesMetadata);

      // 7. Complete Job & Mark Repo Ready
      const durationMs = timer.stop();
      await this.ingestRepo.updateJob(jobId, {
        status: IngestionStatus.COMPLETED,
        totalFiles: targetFiles.length,
        processedFiles: processedCount,
        failedFiles: failedCount,
        totalChunks: allChunks.length,
        completedAt: new Date(),
      });

      await this.repoRepo.updateStatus(repositoryId, RepositoryStatus.READY);

      metrics.incrementIngestions();
      metrics.addChunksIndexed(allChunks.length);

      logger.info(
        {
          repositoryId,
          durationMs,
          totalFiles: targetFiles.length,
          processedFiles: processedCount,
          totalChunks: allChunks.length,
        },
        'Repository ingestion successfully completed'
      );
    } catch (error) {
      const durationMs = timer.stop();
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, repositoryId, durationMs }, 'Repository ingestion failed');

      await this.ingestRepo.updateJob(jobId, {
        status: IngestionStatus.FAILED,
        error: errorMessage,
        completedAt: new Date(),
      });

      await this.repoRepo.updateStatus(repositoryId, RepositoryStatus.FAILED);
      metrics.incrementErrors();
      throw error;
    }
  }
}

export const ingestionService = new IngestionService();
