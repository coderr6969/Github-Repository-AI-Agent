import { describe, it, expect, beforeEach } from 'vitest';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { MockGitHubClient } from '../../src/modules/github/github.client.js';
import { setGitHubClient } from '../../src/modules/github/github.service.js';
import { InMemoryVectorStore } from '../../src/infrastructure/qdrant/qdrant.service.js';
import { MockEmbeddingService } from '../../src/modules/ingestion/embeddings.js';
import { InMemoryIngestionQueue } from '../../src/infrastructure/queue/ingestion.queue.js';
import { RepositoryRepository } from '../../src/modules/repositories/repository.repository.js';
import { IngestionRepository } from '../../src/modules/ingestion/ingestion.repository.js';
import { IngestionStatus, RepositoryStatus } from '@prisma/client';

describe('Integration: Ingestion Pipeline Workflow', () => {
  let mockGh: MockGitHubClient;
  let vectorStore: InMemoryVectorStore;
  let embeddingService: MockEmbeddingService;
  let queue: InMemoryIngestionQueue;
  let repoRepo: RepositoryRepository;
  let ingestRepo: IngestionRepository;
  let ingestionService: IngestionService;

  const testRepoId = '99999999-9999-9999-9999-999999999999';
  let activeRepoStatus = RepositoryStatus.QUEUED;
  let activeJob: any = null;
  let savedFiles: any[] = [];

  beforeEach(() => {
    mockGh = new MockGitHubClient();
    setGitHubClient(mockGh);
    vectorStore = new InMemoryVectorStore();
    embeddingService = new MockEmbeddingService();
    queue = new InMemoryIngestionQueue();

    repoRepo = {
      findById: async (id: string) => ({
        id,
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        url: 'https://github.com/test-owner/test-repo',
        defaultBranch: 'main',
        description: 'Test repo',
        status: activeRepoStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateStatus: async (_id: string, status: RepositoryStatus) => {
        activeRepoStatus = status;
        return {} as any;
      },
      updateMetadata: async () => ({} as any),
    } as unknown as RepositoryRepository;

    ingestRepo = {
      createJob: async (repoId: string) => {
        activeJob = {
          id: 'job-999',
          repositoryId: repoId,
          status: IngestionStatus.QUEUED,
          totalFiles: 0,
          processedFiles: 0,
          failedFiles: 0,
          totalChunks: 0,
          error: null,
          startedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return activeJob;
      },
      getJobById: async () => activeJob,
      getLatestJobByRepositoryId: async () => activeJob,
      updateJob: async (_id: string, data: any) => {
        activeJob = { ...activeJob, ...data };
        return activeJob;
      },
      saveRepositoryFiles: async (_repoId: string, files: any[]) => {
        savedFiles = files;
      },
      getRepositoryFiles: async () => savedFiles,
    } as unknown as IngestionRepository;

    ingestionService = new IngestionService(
      repoRepo,
      ingestRepo,
      queue,
      mockGh,
      vectorStore,
      embeddingService
    );
  });

  it('should process repository end-to-end: fetch files, chunk, embed, index in vector store, and save metadata', async () => {
    await ingestionService.processRepository(testRepoId, 'job-999');

    // 1. Repository status should transition to READY
    expect(activeRepoStatus).toBe(RepositoryStatus.READY);

    // 2. IngestionJob should transition to COMPLETED
    expect(activeJob.status).toBe(IngestionStatus.COMPLETED);
    expect(activeJob.processedFiles).toBeGreaterThan(0);
    expect(activeJob.totalChunks).toBeGreaterThan(0);
    expect(activeJob.completedAt).toBeDefined();

    // 3. Saved files metadata in PostgreSQL
    expect(savedFiles.length).toBeGreaterThan(0);
    const jwtFile = savedFiles.find((f) => f.path === 'src/auth/jwt.ts');
    expect(jwtFile).toBeDefined();
    expect(jwtFile.language).toBe('typescript');

    // 4. Vectors should be indexed in vector store
    const queryVector = await embeddingService.generateQueryEmbedding('JWT token authentication');
    const searchHits = await vectorStore.searchSimilarCode(testRepoId, queryVector, 5);

    expect(searchHits.length).toBeGreaterThan(0);
    expect(searchHits[0].filePath).toBeDefined();
    expect(searchHits[0].startLine).toBeGreaterThanOrEqual(1);
    expect(searchHits[0].endLine).toBeGreaterThanOrEqual(searchHits[0].startLine);
  });
});
