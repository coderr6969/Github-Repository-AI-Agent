import { describe, it, expect, beforeEach } from 'vitest';
import { setGitHubClient } from '../../src/modules/github/github.service.js';
import { MockGitHubClient } from '../../src/modules/github/github.client.js';
import { createCreateIssueTool } from '../../src/modules/agent/tools/create-issue.tool.js';
import { createSearchCodeTool } from '../../src/modules/agent/tools/search-code.tool.js';
import { createGetFileTool } from '../../src/modules/agent/tools/get-file.tool.js';
import { createGetPullRequestTool } from '../../src/modules/agent/tools/get-pr.tool.js';
import { createAnalyzeDependenciesTool } from '../../src/modules/agent/tools/dependency.tool.js';
import { createGenerateTestsTool } from '../../src/modules/agent/tools/generate-tests.tool.js';
import { repositoryRepository } from '../../src/modules/repositories/repository.repository.js';
import { ingestionRepository } from '../../src/modules/ingestion/ingestion.repository.js';
import { RepositoryStatus } from '@prisma/client';

describe('Agent Tools Suite', () => {
  let mockGh: MockGitHubClient;
  const testRepoId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockGh = new MockGitHubClient();
    setGitHubClient(mockGh);

    // Mock repository queries
    repositoryRepository.findById = async (_id: string) => ({
      id: testRepoId,
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      url: 'https://github.com/test-owner/test-repo',
      defaultBranch: 'main',
      description: 'Test repository',
      status: RepositoryStatus.READY,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    ingestionRepository.getRepositoryFiles = async (_repoId: string) => [
      {
        id: 'file-1',
        repositoryId: testRepoId,
        path: 'src/auth/jwt.ts',
        language: 'typescript',
        size: 500,
        sha: 'sha1',
        indexedAt: new Date(),
      },
      {
        id: 'file-2',
        repositoryId: testRepoId,
        path: 'src/middleware/auth.ts',
        language: 'typescript',
        size: 600,
        sha: 'sha2',
        indexedAt: new Date(),
      },
    ];
  });

  describe('createIssue tool', () => {
    it('should NOT create issue and require confirmation when confirmed is false', async () => {
      const tool = createCreateIssueTool(testRepoId);
      const res = await tool.invoke({
        title: 'Fix JWT Token Bug',
        body: 'Potential null pointer in verifyToken',
        confirmed: false,
      });

      const parsed = JSON.parse(res);
      expect(parsed.status).toBe('pending_confirmation');
      expect(parsed.message).toContain('CONFIRMATION_REQUIRED');
      expect(mockGh.createdIssues.length).toBe(0);
    });

    it('should create issue when confirmed is true', async () => {
      const tool = createCreateIssueTool(testRepoId);
      const res = await tool.invoke({
        title: 'Fix JWT Token Bug',
        body: 'Potential null pointer in verifyToken',
        confirmed: true,
      });

      const parsed = JSON.parse(res);
      expect(parsed.status).toBe('created');
      expect(parsed.issueNumber).toBeDefined();
      expect(mockGh.createdIssues.length).toBe(1);
      expect(mockGh.createdIssues[0].title).toBe('Fix JWT Token Bug');
    });
  });

  describe('getFile tool', () => {
    it('should retrieve complete file content with line numbers', async () => {
      const tool = createGetFileTool(testRepoId);
      const res = await tool.invoke({ path: 'src/auth/jwt.ts' });
      const parsed = JSON.parse(res);

      expect(parsed.path).toBe('src/auth/jwt.ts');
      expect(parsed.language).toBe('typescript');
      expect(parsed.content).toContain('1: import jwt');
    });
  });

  describe('getPullRequest tool', () => {
    it('should retrieve pull request details and changed files', async () => {
      const tool = createGetPullRequestTool(testRepoId);
      const res = await tool.invoke({ pullRequestNumber: 42 });
      const parsed = JSON.parse(res);

      expect(parsed.number).toBe(42);
      expect(parsed.title).toContain('JWT token refresh');
      expect(parsed.author).toBe('octocat');
    });
  });

  describe('analyzeDependencies tool', () => {
    it('should parse package.json and module imports', async () => {
      const tool = createAnalyzeDependenciesTool(testRepoId);
      const res = await tool.invoke({ filePath: 'src/auth/jwt.ts' });
      const parsed = JSON.parse(res);

      expect(parsed.analyzedFile).toBe('src/auth/jwt.ts');
      expect(parsed.fileDirectExternalDependencies).toContain('jsonwebtoken');
    });
  });

  describe('generateTests tool', () => {
    it('should inspect file and return testing instructions and content', async () => {
      const tool = createGenerateTestsTool(testRepoId);
      const res = await tool.invoke({ filePath: 'src/auth/jwt.ts' });
      const parsed = JSON.parse(res);

      expect(parsed.filePath).toBe('src/auth/jwt.ts');
      expect(parsed.language).toBe('typescript');
      expect(parsed.recommendedFramework).toBeDefined();
    });
  });
});
