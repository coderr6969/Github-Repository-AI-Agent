import { OpenAIEmbeddings } from '@langchain/openai';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ExternalServiceError } from '../../utils/errors.js';

export interface IEmbeddingService {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  generateQueryEmbedding(text: string): Promise<number[]>;
}

export class OpenAIEmbeddingService implements IEmbeddingService {
  private embeddings: OpenAIEmbeddings;

  constructor(apiKey?: string, model = env.EMBEDDING_MODEL, baseURL?: string) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey || env.EMBEDDING_API_KEY || env.LLM_API_KEY || 'mock-key',
      modelName: model,
      configuration: {
        baseURL: baseURL || env.EMBEDDING_BASE_URL || env.LLM_BASE_URL || undefined,
      },
    });
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      // Process in batches of 50 to avoid API request limits
      const batchSize = 50;
      const allVectors: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vectors = await this.embeddings.embedDocuments(batch);
        allVectors.push(...vectors);
      }

      return allVectors;
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate OpenAI embeddings');
      throw new ExternalServiceError(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`,
        'EMBEDDING_ERROR',
        error
      );
    }
  }

  async generateQueryEmbedding(text: string): Promise<number[]> {
    try {
      return await this.embeddings.embedQuery(text);
    } catch (error) {
      logger.error({ err: error, text: text.substring(0, 50) }, 'Failed to generate query embedding');
      throw new ExternalServiceError(
        `Failed to generate query embedding: ${error instanceof Error ? error.message : String(error)}`,
        'EMBEDDING_ERROR',
        error
      );
    }
  }
}

// Deterministic Mock Embedding for tests and offline development
export class MockEmbeddingService implements IEmbeddingService {
  private dimension: number;

  constructor(dimension = env.VECTOR_DIMENSION) {
    this.dimension = dimension;
  }

  private textToVector(text: string): number[] {
    const vector = new Array(this.dimension).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    for (let i = 0; i < this.dimension; i++) {
      const val = Math.sin(hash + i * 1.618);
      vector[i] = Number(val.toFixed(6));
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dimension; i++) vector[i] /= norm;

    return vector;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.textToVector(t));
  }

  async generateQueryEmbedding(text: string): Promise<number[]> {
    return this.textToVector(text);
  }
}

let defaultEmbeddingService: IEmbeddingService =
  env.EMBEDDING_PROVIDER === 'mock' || !env.EMBEDDING_API_KEY && !env.LLM_API_KEY
    ? new MockEmbeddingService()
    : new OpenAIEmbeddingService();

export function setEmbeddingService(service: IEmbeddingService): void {
  defaultEmbeddingService = service;
}

export function getEmbeddingService(): IEmbeddingService {
  return defaultEmbeddingService;
}
