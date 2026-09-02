import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { setGitHubClient } from '../../src/modules/github/github.service.js';
import { MockGitHubClient } from '../../src/modules/github/github.client.js';
import { repositoryRepository } from '../../src/modules/repositories/repository.repository.js';
import { chatRepository } from '../../src/modules/chat/chat.repository.js';
import { MessageRole, RepositoryStatus } from '@prisma/client';

describe('Integration: Chat & Question Answering Endpoint', () => {
  let app: FastifyInstance;
  let mockGh: MockGitHubClient;
  const mockRepoId = '33333333-3333-3333-3333-333333333333';
  const mockConvId = '44444444-4444-4444-4444-444444444444';

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

    chatRepository.createConversation = async (repoId: string) => ({
      id: mockConvId,
      repositoryId: repoId,
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    chatRepository.getConversation = async (id: string) => ({
      id,
      repositoryId: mockRepoId,
      userId: null,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    chatRepository.getRecentMessages = async () => [];

    chatRepository.saveMessage = async (convId: string, role: MessageRole, content: string, metadata?: any) => ({
      id: 'msg-1',
      conversationId: convId,
      role,
      content,
      metadata: metadata || null,
      createdAt: new Date(),
    });

    chatRepository.listConversationsByRepository = async () => [
      {
        id: mockConvId,
        repositoryId: mockRepoId,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/repositories/:id/chat should answer questions and provide file citations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/repositories/${mockRepoId}/chat`,
      payload: {
        message: 'Where is JWT authentication implemented?',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.conversationId).toBeDefined();
    expect(body.answer).toContain('JWT');
    expect(body.references).toBeInstanceOf(Array);
    expect(body.references.length).toBeGreaterThan(0);
    expect(body.references[0].file).toBe('src/auth/jwt.ts');
  });

  it('GET /api/repositories/:id/conversations should return conversation list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${mockRepoId}/conversations`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.conversations).toBeInstanceOf(Array);
    expect(body.conversations.length).toBe(1);
  });
});
