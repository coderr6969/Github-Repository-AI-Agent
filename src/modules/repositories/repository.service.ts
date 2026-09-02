import { RepositoryStatus } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { parseGitHubUrl } from '../../utils/github-url.js';
import { getGitHubClient } from '../github/github.service.js';
import { IGitHubClient } from '../github/github.interface.js';
import { repositoryRepository, RepositoryRepository } from './repository.repository.js';
import { ingestionRepository, IngestionRepository } from '../ingestion/ingestion.repository.js';
import { ingestionService, IngestionService } from '../ingestion/ingestion.service.js';

export class RepositoryService {
  constructor(
    private repoRepo: RepositoryRepository = repositoryRepository,
    private ingestRepo: IngestionRepository = ingestionRepository,
    private ingestService: IngestionService = ingestionService,
    private ghClient: IGitHubClient = getGitHubClient()
  ) {}

  async createRepository(rawUrl: string): Promise<{ repositoryId: string; status: string; repository: any }> {
    const parsed = parseGitHubUrl(rawUrl);
    logger.info({ parsed }, 'Registering GitHub repository');

    // Check if already registered
    const existing = await this.repoRepo.findByFullName(parsed.fullName);
    if (existing) {
      // If it exists, return existing repository or restart ingestion if requested
      return {
        repositoryId: existing.id,
        status: existing.status.toLowerCase(),
        repository: existing,
      };
    }

    // Fetch repository metadata from GitHub to validate repo exists
    const gh = getGitHubClient();
    const meta = await gh.getRepository(parsed.owner, parsed.repo);

    // Save repository in DB
    const repo = await this.repoRepo.create({
      owner: meta.owner,
      name: meta.name,
      fullName: meta.fullName,
      url: meta.url,
      defaultBranch: meta.defaultBranch,
      description: meta.description,
      status: RepositoryStatus.QUEUED,
    });

    // Queue asynchronous ingestion in BullMQ
    const queueResult = await this.ingestService.queueIngestion(repo.id);

    return {
      repositoryId: repo.id,
      status: 'queued',
      repository: repo,
    };
  }

  async listRepositories(limit = 20, offset = 0) {
    return this.repoRepo.listAll(limit, offset);
  }

  async getRepository(id: string) {
    const repo = await this.repoRepo.findById(id);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${id}`, 'REPOSITORY_NOT_FOUND');
    }
    return repo;
  }

  async getIngestionStatus(repositoryId: string) {
    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }

    const latestJob = await this.ingestRepo.getLatestJobByRepositoryId(repositoryId);

    return {
      repositoryId: repo.id,
      repositoryStatus: repo.status,
      status: latestJob ? latestJob.status.toLowerCase() : repo.status.toLowerCase(),
      totalFiles: latestJob?.totalFiles || 0,
      processedFiles: latestJob?.processedFiles || 0,
      failedFiles: latestJob?.failedFiles || 0,
      totalChunks: latestJob?.totalChunks || 0,
      startedAt: latestJob?.startedAt || null,
      completedAt: latestJob?.completedAt || null,
      error: latestJob?.error || null,
    };
  }

  async startOrRestartIngestion(repositoryId: string) {
    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }

    return this.ingestService.queueIngestion(repositoryId);
  }
}

export const repositoryService = new RepositoryService();
