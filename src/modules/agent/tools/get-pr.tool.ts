import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../config/logger.js';
import { getGitHubClient } from '../../github/github.service.js';
import { parseGitHubUrl } from '../../../utils/github-url.js';
import { repositoryRepository } from '../../repositories/repository.repository.js';
import { startTimer } from '../../../utils/observability.js';

export function createGetPullRequestTool(repositoryId: string) {
  return tool(
    async ({ pullRequestNumber }: { pullRequestNumber: number }) => {
      const timer = startTimer();
      logger.info({ repositoryId, pullRequestNumber }, 'Executing getPullRequest tool');

      try {
        const repo = await repositoryRepository.findById(repositoryId);
        if (!repo) {
          return JSON.stringify({ error: `Repository ${repositoryId} not found in database.` });
        }

        const { owner, repo: repoName } = parseGitHubUrl(repo.url);
        const gh = getGitHubClient();

        const pr = await gh.getPullRequest(owner, repoName, pullRequestNumber);

        logger.info(
          { repositoryId, pullRequestNumber, changedFiles: pr.changedFiles, durationMs: timer.stop() },
          'getPullRequest tool completed'
        );

        return JSON.stringify({
          number: pr.number,
          title: pr.title,
          description: pr.description,
          author: pr.author,
          state: pr.state,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFilesCount: pr.changedFiles,
          files: pr.files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ? f.patch.substring(0, 1000) : undefined,
          })),
        });
      } catch (error) {
        logger.error({ err: error, repositoryId, pullRequestNumber }, 'getPullRequest tool failed');
        return JSON.stringify({
          error: `Failed to retrieve pull request #${pullRequestNumber}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
    {
      name: 'getPullRequest',
      description: 'Retrieve details, status, description, and changed files/diff for a specific GitHub Pull Request.',
      schema: z.object({
        pullRequestNumber: z.number().int().positive().describe('The GitHub Pull Request number (e.g. 42)'),
      }),
    }
  );
}
