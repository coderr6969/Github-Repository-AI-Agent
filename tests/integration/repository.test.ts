import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { setGitHubClient } from '../../src/modules/github/github.service.js';
import { MockGitHubClient } from '../../src/modules/github/github.client.js';
import { repositoryRepository } from '../../src/modules/repositories/repository.repository.js';
import { ingestionRepository } from '../../src/modules/ingestion/ingestion.repository.js';
import { IngestionStatus, RepositoryStatus } from '@prisma/client';

describe('Integration: Repository API Endpoints', () => {
  let app: FastifyInstance;
  let mockGh: MockGitHubClient;
  const mockRepoId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    mockGh = new MockGitHubClient();
    setGitHubClient(mockGh);

    // Mock database layers for fast integration tests
    repositoryRepository.findByFullName = async (name: string) => {
      if (name === 'already/exists') {
        return {
          id: mockRepoId,
          owner: 'already',
          name: 'exists',
          fullName: 'already/exists',
          url: 'https://github.com/already/exists',
          defaultBranch: 'main',
          description: 'Existing repo',
          status: RepositoryStatus.READY,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    };

    repositoryRepository.create = async (data: any) => ({
      id: mockRepoId,
      owner: data.owner,
      name: data.name,
      fullName: data.fullName,
      url: data.url,
      defaultBranch: data.defaultBranch || 'main',
      description: data.description || null,
      status: RepositoryStatus.QUEUED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    repositoryRepository.updateStatus = async (id: string, status: RepositoryStatus) => ({
      id,
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      url: 'https://github.com/test-owner/test-repo',
      defaultBranch: 'main',
      description: 'Mock repository',
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    repositoryRepository.findById = async (id: string) => ({
      id,
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      url: 'https://github.com/test-owner/test-repo',
      defaultBranch: 'main',
      description: 'Mock repository',
      status: RepositoryStatus.READY,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    repositoryRepository.listAll = async () => [
      {
        id: mockRepoId,
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        url: 'https://github.com/test-owner/test-repo',
        defaultBranch: 'main',
        description: 'Mock repository',
        status: RepositoryStatus.READY,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    ingestionRepository.createJob = async (repoId: string) => ({
      id: 'job-123',
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
    });

    ingestionRepository.getLatestJobByRepositoryId = async (repoId: string) => ({
      id: 'job-123',
      repositoryId: repoId,
      status: IngestionStatus.COMPLETED,
      totalFiles: 12,
      processedFiles: 12,
      failedFiles: 0,
      totalChunks: 45,
      error: null,
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/repositories should validate URL and queue ingestion', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: {
        url: 'https://github.com/test-owner/test-repo',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.repositoryId).toBe(mockRepoId);
    expect(body.status).toBe('queued');
  });

  it('POST /api/repositories should reject invalid non-github URLs with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: {
        url: 'not-a-valid-url',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/repositories should list repositories', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/repositories',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.repositories).toBeInstanceOf(Array);
    expect(body.repositories.length).toBeGreaterThan(0);
  });

  it('GET /api/repositories/:id/ingestion should return ingestion statistics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${mockRepoId}/ingestion`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.repositoryId).toBe(mockRepoId);
    expect(body.status).toBe('completed');
    expect(body.totalFiles).toBe(12);
    expect(body.totalChunks).toBe(45);
  });
});
