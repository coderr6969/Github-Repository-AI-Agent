import { Octokit } from 'octokit';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  GitTreeItem,
  PullRequestDetail,
  RepositoryMetadata,
  GitHubIssueResult,
} from '../../types/index.js';
import {
  AppError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../../utils/errors.js';
import { GitHubFileContent, IGitHubClient } from './github.interface.js';
import { detectLanguage } from '../ingestion/file-filter.js';

export class GitHubClient implements IGitHubClient {
  private octokit: Octokit;

  constructor(token?: string) {
    const authToken = token || env.GITHUB_TOKEN;
    this.octokit = new Octokit({
      auth: authToken || undefined,
      userAgent: 'GitHub-Repo-AI-Agent-MVP/1.0.0',
    });
  }

  private handleError(error: unknown, context: string): never {
    const err = error as { status?: number; message?: string; response?: { data?: unknown } };
    const status = err?.status;
    const message = err?.message || 'Unknown GitHub API error';

    logger.error({ err, context }, `GitHub API Error during: ${context}`);

    if (status === 404) {
      throw new NotFoundError(`GitHub resource not found during ${context}: ${message}`, 'GITHUB_NOT_FOUND');
    }
    if (status === 403 || status === 429) {
      throw new RateLimitError(`GitHub API rate limit exceeded or access forbidden: ${message}`);
    }
    if (status === 401) {
      throw new AppError('Invalid or unauthorized GitHub token', 401, 'GITHUB_UNAUTHORIZED');
    }
    if (status === 422) {
      throw new ValidationError(`GitHub validation error: ${message}`, 'GITHUB_VALIDATION_ERROR');
    }

    throw new ExternalServiceError(`GitHub API request failed: ${message}`, 'GITHUB_API_ERROR', err?.response?.data);
  }

  async getRepository(owner: string, repo: string): Promise<RepositoryMetadata> {
    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      const data = response.data;
      return {
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        defaultBranch: data.default_branch,
        url: data.html_url,
        size: data.size,
      };
    } catch (error) {
      this.handleError(error, `getRepository(${owner}/${repo})`);
    }
  }

  async getTree(owner: string, repo: string, treeSha: string, recursive = true): Promise<GitTreeItem[]> {
    try {
      const response = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: recursive ? 'true' : undefined,
      });

      return response.data.tree.map((item) => ({
        path: item.path || '',
        mode: item.mode || '',
        type: item.type === 'blob' ? 'blob' : 'tree',
        sha: item.sha || '',
        size: item.size,
        url: item.url,
      }));
    } catch (error) {
      this.handleError(error, `getTree(${owner}/${repo}, ${treeSha})`);
    }
  }

  async getFile(owner: string, repo: string, path: string, ref?: string): Promise<GitHubFileContent> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const data = response.data;
      if (Array.isArray(data) || data.type !== 'file') {
        throw new ValidationError(`Path "${path}" is a directory, not a file`, 'NOT_A_FILE');
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const language = detectLanguage(path);

      return {
        path,
        content,
        language,
        size: data.size,
        sha: data.sha,
      };
    } catch (error) {
      this.handleError(error, `getFile(${owner}/${repo}, ${path})`);
    }
  }

  async searchCode(owner: string, repo: string, query: string): Promise<Array<{ path: string; sha: string }>> {
    try {
      const q = `${query} repo:${owner}/${repo}`;
      const response = await this.octokit.rest.search.code({
        q,
        per_page: 20,
      });

      return response.data.items.map((item) => ({
        path: item.path,
        sha: item.sha,
      }));
    } catch (error) {
      this.handleError(error, `searchCode(${owner}/${repo}, ${query})`);
    }
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestDetail> {
    try {
      const [prResponse, filesResponse] = await Promise.all([
        this.octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        }),
        this.octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: prNumber,
          per_page: 50,
        }),
      ]);

      const pr = prResponse.data;
      const files = filesResponse.data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }));

      let state: 'open' | 'closed' | 'merged' = 'open';
      if (pr.merged_at) {
        state = 'merged';
      } else if (pr.state === 'closed') {
        state = 'closed';
      }

      return {
        number: pr.number,
        title: pr.title,
        description: pr.body,
        author: pr.user?.login || 'unknown',
        state,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at || null,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        files,
      };
    } catch (error) {
      this.handleError(error, `getPullRequest(${owner}/${repo}, #${prNumber})`);
    }
  }

  async createIssue(owner: string, repo: string, title: string, body: string): Promise<GitHubIssueResult> {
    try {
      const response = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
      });

      return {
        issueNumber: response.data.number,
        url: response.data.html_url,
        title: response.data.title,
        body: response.data.body || '',
        confirmed: true,
        status: 'created',
        message: `Successfully created GitHub issue #${response.data.number}`,
      };
    } catch (error) {
      this.handleError(error, `createIssue(${owner}/${repo}, "${title}")`);
    }
  }
}

// Mock GitHub Client for testing and isolated offline usage
export class MockGitHubClient implements IGitHubClient {
  public mockFiles: Map<string, string> = new Map();
  public mockRepo: RepositoryMetadata = {
    owner: 'test-owner',
    name: 'test-repo',
    fullName: 'test-owner/test-repo',
    description: 'A mock repository for testing',
    defaultBranch: 'main',
    url: 'https://github.com/test-owner/test-repo',
    size: 1024,
  };
  public mockPRs: Map<number, PullRequestDetail> = new Map();
  public createdIssues: Array<{ owner: string; repo: string; title: string; body: string }> = [];

  constructor() {
    this.seedDefaultMocks();
  }

  private seedDefaultMocks() {
    this.mockFiles.set(
      'package.json',
      JSON.stringify(
        {
          name: 'sample-project',
          version: '1.0.0',
          dependencies: {
            jsonwebtoken: '^9.0.0',
            bcrypt: '^5.1.0',
            fastify: '^5.0.0',
          },
        },
        null,
        2
      )
    );

    this.mockFiles.set(
      'src/auth/jwt.ts',
      `import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET || 'dev-secret';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, SECRET_KEY) as TokenPayload;
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}
`
    );

    this.mockFiles.set(
      'src/middleware/auth.ts',
      `import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../auth/jwt.js';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.substring(7);
  try {
    const user = verifyToken(token);
    (request as any).user = user;
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid token' });
  }
}
`
    );

    this.mockPRs.set(42, {
      number: 42,
      title: 'Add JWT token refresh endpoint',
      description: 'Implements refresh token support with rotation in auth module',
      author: 'octocat',
      state: 'open',
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-22T14:30:00Z',
      mergedAt: null,
      additions: 120,
      deletions: 15,
      changedFiles: 3,
      files: [
        {
          filename: 'src/auth/jwt.ts',
          status: 'modified',
          additions: 45,
          deletions: 5,
          patch: '@@ -10,6 +10,18 @@ export function generateRefreshToken...',
        },
      ],
    });
  }

  async getRepository(owner: string, repo: string): Promise<RepositoryMetadata> {
    return {
      ...this.mockRepo,
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
    };
  }

  async getTree(owner: string, repo: string, _treeSha: string, _recursive = true): Promise<GitTreeItem[]> {
    const items: GitTreeItem[] = [];
    for (const [path, content] of this.mockFiles.entries()) {
      items.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: `sha_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        size: Buffer.byteLength(content, 'utf-8'),
      });
    }
    return items;
  }

  async getFile(owner: string, repo: string, path: string, _ref?: string): Promise<GitHubFileContent> {
    const content = this.mockFiles.get(path);
    if (!content) {
      throw new NotFoundError(`File not found in mock repository: ${path}`, 'FILE_NOT_FOUND');
    }
    return {
      path,
      content,
      language: detectLanguage(path),
      size: Buffer.byteLength(content, 'utf-8'),
      sha: `sha_${path}`,
    };
  }

  async searchCode(owner: string, repo: string, query: string): Promise<Array<{ path: string; sha: string }>> {
    const results: Array<{ path: string; sha: string }> = [];
    for (const [path, content] of this.mockFiles.entries()) {
      if (content.toLowerCase().includes(query.toLowerCase()) || path.toLowerCase().includes(query.toLowerCase())) {
        results.push({ path, sha: `sha_${path}` });
      }
    }
    return results;
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestDetail> {
    const pr = this.mockPRs.get(prNumber);
    if (!pr) {
      throw new NotFoundError(`Pull request #${prNumber} not found`, 'PR_NOT_FOUND');
    }
    return pr;
  }

  async createIssue(owner: string, repo: string, title: string, body: string): Promise<GitHubIssueResult> {
    this.createdIssues.push({ owner, repo, title, body });
    const issueNumber = 100 + this.createdIssues.length;
    return {
      issueNumber,
      url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
      title,
      body,
      confirmed: true,
      status: 'created',
      message: `Successfully created GitHub issue #${issueNumber}`,
    };
  }
}
