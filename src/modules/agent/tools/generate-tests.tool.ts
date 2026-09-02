import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../config/logger.js';
import { getGitHubClient } from '../../github/github.service.js';
import { parseGitHubUrl } from '../../../utils/github-url.js';
import { repositoryRepository } from '../../repositories/repository.repository.js';
import { startTimer } from '../../../utils/observability.js';

export function createGenerateTestsTool(repositoryId: string) {
  return tool(
    async ({ filePath }: { filePath: string }) => {
      const timer = startTimer();
      logger.info({ repositoryId, filePath }, 'Executing generateTests tool');

      try {
        const repo = await repositoryRepository.findById(repositoryId);
        if (!repo) {
          return JSON.stringify({ error: `Repository ${repositoryId} not found in database.` });
        }

        const { owner, repo: repoName } = parseGitHubUrl(repo.url);
        const gh = getGitHubClient();

        const fileData = await gh.getFile(owner, repoName, filePath, repo.defaultBranch);

        // Detect testing framework from package.json if available
        let framework = 'vitest / jest';
        try {
          const pkg = await gh.getFile(owner, repoName, 'package.json', repo.defaultBranch);
          if (pkg.content.includes('vitest')) framework = 'vitest';
          else if (pkg.content.includes('jest')) framework = 'jest';
          else if (pkg.content.includes('mocha')) framework = 'mocha';
        } catch {
          if (fileData.language === 'python') framework = 'pytest';
          else if (fileData.language === 'go') framework = 'testing';
          else if (fileData.language === 'java') framework = 'JUnit 5';
          else if (fileData.language === 'rust') framework = 'cargo test';
        }

        logger.info({ repositoryId, filePath, framework, durationMs: timer.stop() }, 'generateTests tool completed');

        return JSON.stringify({
          filePath: fileData.path,
          language: fileData.language,
          recommendedFramework: framework,
          instructions: 'The code content of the target file has been loaded. Generate comprehensive unit tests covering standard cases, edge cases, error conditions, and mocks. Return the test suite in a clear markdown code block.',
          fileContent: fileData.content,
        });
      } catch (error) {
        logger.error({ err: error, repositoryId, filePath }, 'generateTests tool failed');
        return JSON.stringify({
          error: `Failed to prepare test generation for "${filePath}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
    {
      name: 'generateTests',
      description: 'Prepare and generate production-quality unit tests for a specific source file, determining the appropriate testing framework and test cases.',
      schema: z.object({
        filePath: z.string().describe('The path of the source file to generate tests for (e.g. "src/auth/jwt.ts")'),
      }),
    }
  );
}
