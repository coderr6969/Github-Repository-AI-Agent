import {
  RepositoryMetadata,
  GitTreeItem,
  PullRequestDetail,
  GitHubIssueResult,
} from '../../types/index.js';

export interface GitHubFileContent {
  path: string;
  content: string;
  language: string;
  size: number;
  sha: string;
}

export interface IGitHubClient {
  getRepository(owner: string, repo: string): Promise<RepositoryMetadata>;
  getTree(owner: string, repo: string, treeSha: string, recursive?: boolean): Promise<GitTreeItem[]>;
  getFile(owner: string, repo: string, path: string, ref?: string): Promise<GitHubFileContent>;
  searchCode(owner: string, repo: string, query: string): Promise<Array<{ path: string; sha: string }>>;
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestDetail>;
  createIssue(owner: string, repo: string, title: string, body: string): Promise<GitHubIssueResult>;
}
