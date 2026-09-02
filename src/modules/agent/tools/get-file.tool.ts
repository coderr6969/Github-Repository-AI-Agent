import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../config/logger.js';
import { getGitHubClient } from '../../github/github.service.js';
import { parseGitHubUrl } from '../../../utils/github-url.js';
import { repositoryRepository } from '../../repositories/repository.repository.js';
import { startTimer } from '../../../utils/observability.js';

export function createGetFileTool(repositoryId: string) {
  return tool(
    async ({ path }: { path: string }) => {
      const timer = startTimer();
      logger.info({ repositoryId, path }, 'Executing getFile tool');

      try {
        const repo = await repositoryRepository.findById(repositoryId);
        if (!repo) {
          return JSON.stringify({ error: `Repository ${repositoryId} not found in database.` });
        }

        const { owner, repo: repoName } = parseGitHubUrl(repo.url);
        const gh = getGitHubClient();

        const fileData = await gh.getFile(owner, repoName, path, repo.defaultBranch);

        logger.info({ repositoryId, path, size: fileData.size, durationMs: timer.stop() }, 'getFile tool completed');

        // Number lines for accurate LLM reading
        const lines = fileData.content.split('\n');
        const numberedContent = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');

        return JSON.stringify({
          path: fileData.path,
          language: fileData.language,
          totalLines: lines.length,
          sizeBytes: fileData.size,
          content: numberedContent,
        });
      } catch (error) {
        logger.error({ err: error, repositoryId, path }, 'getFile tool failed');
        return JSON.stringify({
          error: `Could not retrieve file "${path}": ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    {
      name: 'getFile',
      description: 'Retrieve the complete source content of a specific file from the repository, including line numbers.',
      schema: z.object({
        path: z.string().describe('Relative path to the file in the repository (e.g. "src/auth/jwt.ts", "package.json")'),
      }),
    }
  );
}
