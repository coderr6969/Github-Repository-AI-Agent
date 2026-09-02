import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { CodeChunk, RetrievedChunk } from '../../types/index.js';
import { IVectorStore, VectorPoint } from './vector-store.interface.js';
import { ExternalServiceError } from '../../utils/errors.js';

export class QdrantService implements IVectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private vectorDimension: number;

  constructor(
    client?: QdrantClient,
    collectionName = env.QDRANT_COLLECTION,
    vectorDimension = env.VECTOR_DIMENSION
  ) {
    this.collectionName = collectionName;
    this.vectorDimension = vectorDimension;
    this.client =
      client ||
      new QdrantClient({
        url: env.QDRANT_URL,
        apiKey: env.QDRANT_API_KEY || undefined,
        checkCompatibility: false,
      });
  }

  async ensureCollection(): Promise<void> {
    try {
      const response = await this.client.getCollections();
      const exists = response.collections.some((c) => c.name === this.collectionName);

      if (!exists) {
        logger.info(`Creating Qdrant collection: "${this.collectionName}" (dim: ${this.vectorDimension})`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorDimension,
            distance: 'Cosine',
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to ensure Qdrant collection ${this.collectionName}`);
      throw new ExternalServiceError(
        `Failed to initialize Qdrant collection: ${error instanceof Error ? error.message : String(error)}`,
        'QDRANT_INIT_ERROR',
        error
      );
    }
  }

  async upsertChunks(chunks: CodeChunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error(`Chunks count (${chunks.length}) does not match embeddings count (${embeddings.length})`);
    }

    if (chunks.length === 0) return;

    await this.ensureCollection();

    const points: VectorPoint[] = chunks.map((chunk, index) => ({
      id: uuidv4(),
      vector: embeddings[index],
      payload: {
        content: chunk.content,
        repositoryId: chunk.repositoryId,
        filePath: chunk.filePath,
        language: chunk.language,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        branch: chunk.branch,
        chunkId: chunk.chunkId,
      },
    }));

    try {
      // Upsert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        await this.client.upsert(this.collectionName, {
          wait: true,
          points: batch,
        });
      }
      logger.info(`Upserted ${points.length} vectors into Qdrant collection "${this.collectionName}"`);
    } catch (error) {
      logger.error({ err: error }, 'Failed to upsert vectors into Qdrant');
      throw new ExternalServiceError(
        `Failed to upsert vectors: ${error instanceof Error ? error.message : String(error)}`,
        'QDRANT_UPSERT_ERROR',
        error
      );
    }
  }

  async searchSimilarCode(
    repositoryId: string,
    queryEmbedding: number[],
    topK = 5
  ): Promise<RetrievedChunk[]> {
    try {
      await this.ensureCollection();

      const searchResult = await this.client.query(this.collectionName, {
        query: queryEmbedding,
        limit: topK,
        filter: {
          must: [
            {
              key: 'repositoryId',
              match: {
                value: repositoryId,
              },
            },
          ],
        },
        with_payload: true,
      });

      const points = searchResult.points || [];

      return points.map((hit: any) => {
        const payload = (hit.payload || {}) as {
          filePath?: string;
          startLine?: number;
          endLine?: number;
          content?: string;
          language?: string;
          chunkId?: string;
        };

        return {
          chunkId: payload.chunkId,
          filePath: payload.filePath || 'unknown',
          startLine: payload.startLine || 1,
          endLine: payload.endLine || 1,
          content: payload.content || '',
          language: payload.language,
          score: typeof hit.score === 'number' ? hit.score : 1.0,
        };
      });
    } catch (error) {
      logger.error({ err: error, repositoryId }, 'Failed to search Qdrant for similar code');
      throw new ExternalServiceError(
        `Qdrant search error: ${error instanceof Error ? error.message : String(error)}`,
        'QDRANT_SEARCH_ERROR',
        error
      );
    }
  }

  async deleteByRepositoryId(repositoryId: string): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'repositoryId',
              match: {
                value: repositoryId,
              },
            },
          ],
        },
      });
      logger.info(`Deleted Qdrant vectors for repository: ${repositoryId}`);
    } catch (error) {
      logger.error({ err: error, repositoryId }, 'Failed to delete repository vectors from Qdrant');
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Qdrant health check failed');
      return false;
    }
  }
}

// In-Memory Vector Store for unit testing & fallback
export class InMemoryVectorStore implements IVectorStore {
  private points: VectorPoint[] = [];

  async ensureCollection(): Promise<void> {}

  async upsertChunks(chunks: CodeChunk[], embeddings: number[][]): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = embeddings[i];
      this.points.push({
        id: uuidv4(),
        vector,
        payload: {
          content: chunk.content,
          repositoryId: chunk.repositoryId,
          filePath: chunk.filePath,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          branch: chunk.branch,
          chunkId: chunk.chunkId,
        },
      });
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async searchSimilarCode(repositoryId: string, queryEmbedding: number[], topK = 5): Promise<RetrievedChunk[]> {
    const filtered = this.points.filter((p) => p.payload.repositoryId === repositoryId);
    const scored = filtered.map((p) => ({
      chunkId: p.payload.chunkId,
      filePath: p.payload.filePath,
      startLine: p.payload.startLine,
      endLine: p.payload.endLine,
      content: p.payload.content,
      language: p.payload.language,
      score: this.cosineSimilarity(queryEmbedding, p.vector),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async deleteByRepositoryId(repositoryId: string): Promise<void> {
    this.points = this.points.filter((p) => p.payload.repositoryId !== repositoryId);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

export const qdrantService: IVectorStore = new QdrantService();
