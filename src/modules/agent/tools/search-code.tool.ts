import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../config/logger.js';
import { getEmbeddingService } from '../../ingestion/embeddings.js';
import { qdrantService } from '../../../infrastructure/qdrant/qdrant.service.js';
import { startTimer } from '../../../utils/observability.js';

export function createSearchCodeTool(repositoryId: string) {
  return tool(
    async ({ query }: { query: string }) => {
      const timer = startTimer();
      logger.info({ repositoryId, query }, 'Executing searchCode tool');

      try {
        const embeddingService = getEmbeddingService();
        const queryVector = await embeddingService.generateQueryEmbedding(query);
        const results = await qdrantService.searchSimilarCode(repositoryId, queryVector, 5);

        if (results.length === 0) {
          return JSON.stringify({
            message: `No code chunks found matching query: "${query}" in repository.`,
            results: [],
          });
        }

        const formatted = results.map((r) => ({
          filePath: r.filePath,
          startLine: r.startLine,
          endLine: r.endLine,
          language: r.language,
          score: Number(r.score.toFixed(4)),
          content: r.content,
        }));

        logger.info(
          { repositoryId, query, count: results.length, durationMs: timer.stop() },
          'searchCode tool completed'
        );

        return JSON.stringify({
          query,
          matchCount: results.length,
          chunks: formatted,
        });
      } catch (error) {
        logger.error({ err: error, repositoryId, query }, 'searchCode tool failed');
        return JSON.stringify({
          error: `Failed to search code: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    {
      name: 'searchCode',
      description: 'Search repository source code semantically using vector similarity. Returns relevant code chunks with file paths and line numbers.',
      schema: z.object({
        query: z.string().describe('The natural language or code search query (e.g. "JWT authentication middleware", "user registration controller")'),
      }),
    }
  );
}
