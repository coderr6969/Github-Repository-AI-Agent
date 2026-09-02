import { describe, it, expect } from 'vitest';
import { InMemoryVectorStore } from '../../src/infrastructure/qdrant/qdrant.service.js';
import { MockEmbeddingService } from '../../src/modules/ingestion/embeddings.js';
import { CodeChunk } from '../../src/types/index.js';

describe('Vector Store Repository Isolation', () => {
  it('should strictly isolate search results by repositoryId', async () => {
    const vectorStore = new InMemoryVectorStore();
    const embedService = new MockEmbeddingService();

    const repoAChunks: CodeChunk[] = [
      {
        chunkId: 'repoA#chunk1',
        repositoryId: 'repo-A',
        filePath: 'src/auth/jwt.ts',
        language: 'typescript',
        startLine: 1,
        endLine: 20,
        branch: 'main',
        content: 'function authenticateUser() { return JWT_SECRET; }',
      },
    ];

    const repoBChunks: CodeChunk[] = [
      {
        chunkId: 'repoB#chunk1',
        repositoryId: 'repo-B',
        filePath: 'src/secrets/keys.ts',
        language: 'typescript',
        startLine: 1,
        endLine: 20,
        branch: 'main',
        content: 'function getSecretKey() { return SUPER_SECRET_B; }',
      },
    ];

    const embeddingsA = await embedService.generateEmbeddings(repoAChunks.map((c) => c.content));
    const embeddingsB = await embedService.generateEmbeddings(repoBChunks.map((c) => c.content));

    await vectorStore.upsertChunks(repoAChunks, embeddingsA);
    await vectorStore.upsertChunks(repoBChunks, embeddingsB);

    const queryVector = await embedService.generateQueryEmbedding('authenticateUser');

    // Search specifically within Repo A
    const resultsA = await vectorStore.searchSimilarCode('repo-A', queryVector, 5);
    expect(resultsA.length).toBe(1);
    expect(resultsA[0].filePath).toBe('src/auth/jwt.ts');

    // Ensure results do NOT contain Repo B chunks
    for (const r of resultsA) {
      expect(r.filePath).not.toBe('src/secrets/keys.ts');
    }

    // Search specifically within Repo B
    const resultsB = await vectorStore.searchSimilarCode('repo-B', queryVector, 5);
    expect(resultsB.length).toBe(1);
    expect(resultsB[0].filePath).toBe('src/secrets/keys.ts');
  });
});
