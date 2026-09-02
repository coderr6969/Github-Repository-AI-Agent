export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
}

export interface RepositoryMetadata {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  url: string;
  size: number;
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url?: string;
}

export interface CodeChunk {
  chunkId: string;
  repositoryId: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  branch: string;
  content: string;
}

export interface RetrievedChunk {
  chunkId?: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  language?: string;
}

export interface FileReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

export interface ToolResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  durationMs: number;
}

export interface DependencyAnalysisResult {
  filePath?: string;
  internalImports: string[];
  externalDependencies: string[];
  dependents?: string[];
  summary: string;
}

export interface UnitTestGenerationResult {
  filePath: string;
  testingFramework: string;
  testCode: string;
  explanation: string;
}

export interface PullRequestDetail {
  number: number;
  title: string;
  description: string | null;
  author: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

export interface GitHubIssueResult {
  issueNumber?: number;
  url?: string;
  title: string;
  body: string;
  confirmed: boolean;
  status: 'created' | 'pending_confirmation' | 'rejected';
  message: string;
}

export interface ChatResponsePayload {
  answer: string;
  references: FileReference[];
  toolsUsed: string[];
  metrics?: {
    totalDurationMs: number;
    llmCalls: number;
  };
}
