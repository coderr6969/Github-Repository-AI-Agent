import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { setGitHubClient } from '../../src/modules/github/github.service.js';
import { MockGitHubClient } from '../../src/modules/github/github.client.js';
import { repositoryRepository } from '../../src/modules/repositories/repository.repository.js';
import { chatRepository } from '../../src/modules/chat/chat.repository.js';
import { RepositoryStatus } from '@prisma/client';

describe('Integration: GitHub Actions (PR and Issues)', () => {
  let app: FastifyInstance;
  let mockGh: MockGitHubClient;
  const mockRepoId = '55555555-5555-5555-5555-555555555555';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    mockGh = new MockGitHubClient();
    setGitHubClient(mockGh);

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

    chatRepository.recordAuditLog = async () => ({
      id: 'audit-1',
      repositoryId: mockRepoId,
      action: 'CREATE_GITHUB_ISSUE',
      details: null,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/repositories/:id/pulls/:number should return pull request details and diff', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${mockRepoId}/pulls/42`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.number).toBe(42);
    expect(body.title).toContain('JWT token refresh');
    expect(body.author).toBe('octocat');
    expect(body.files.length).toBeGreaterThan(0);
  });

  it('POST /api/repositories/:id/issues should enforce confirmation when confirmed: false', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/repositories/${mockRepoId}/issues`,
      payload: {
        title: 'Security Bug: Expired JWT accepted',
        body: 'JWT verification does not strictly enforce maxAge',
        confirmed: false,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('CONFIRMATION_REQUIRED');
    expect(mockGh.createdIssues.length).toBe(0);
  });

  it('POST /api/repositories/:id/issues should create issue when confirmed: true', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/repositories/${mockRepoId}/issues`,
      payload: {
        title: 'Security Bug: Expired JWT accepted',
        body: 'JWT verification does not strictly enforce maxAge',
        confirmed: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('created');
    expect(body.issueNumber).toBeDefined();
    expect(mockGh.createdIssues.length).toBe(1);
    expect(mockGh.createdIssues[0].title).toBe('Security Bug: Expired JWT accepted');
  });
});
