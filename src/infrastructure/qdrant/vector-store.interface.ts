import { CodeChunk, RetrievedChunk } from '../../types/index.js';

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    repositoryId: string;
    filePath: string;
    language: string;
    startLine: number;
    endLine: number;
    branch: string;
    chunkId: string;
    [key: string]: unknown;
  };
}

export interface IVectorStore {
  ensureCollection(): Promise<void>;
  upsertChunks(chunks: CodeChunk[], embeddings: number[][]): Promise<void>;
  searchSimilarCode(repositoryId: string, queryEmbedding: number[], topK?: number): Promise<RetrievedChunk[]>;
  deleteByRepositoryId(repositoryId: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}
