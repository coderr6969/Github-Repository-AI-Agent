import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../config/logger.js';
import { getGitHubClient } from '../../github/github.service.js';
import { parseGitHubUrl } from '../../../utils/github-url.js';
import { repositoryRepository } from '../../repositories/repository.repository.js';
import { startTimer } from '../../../utils/observability.js';

export function createCreateIssueTool(repositoryId: string) {
  return tool(
    async ({
      title,
      body,
      confirmed = false,
    }: {
      title: string;
      body: string;
      confirmed?: boolean;
    }) => {
      const timer = startTimer();
      logger.info({ repositoryId, title, confirmed }, 'Executing createIssue tool');

      try {
        const repo = await repositoryRepository.findById(repositoryId);
        if (!repo) {
          return JSON.stringify({ error: `Repository ${repositoryId} not found in database.` });
        }

        // SAFETY ENFORCEMENT: Explicit user confirmation required for write operations
        if (!confirmed) {
          return JSON.stringify({
            status: 'pending_confirmation',
            message: 'CONFIRMATION_REQUIRED: GitHub issue creation is a write operation that modifies the repository. Please confirm with the user before executing.',
            proposedIssue: {
              title,
              body,
            },
            instructionToAgent: 'Do NOT claim the issue was created. Instead, present the proposed issue title and body to the user and ask: "Would you like me to create this GitHub issue on repository ' + repo.fullName + '?"',
          });
        }

        const { owner, repo: repoName } = parseGitHubUrl(repo.url);
        const gh = getGitHubClient();

        const result = await gh.createIssue(owner, repoName, title, body);

        logger.info(
          { repositoryId, issueNumber: result.issueNumber, durationMs: timer.stop() },
          'createIssue tool executed successfully'
        );

        return JSON.stringify({
          status: 'created',
          issueNumber: result.issueNumber,
          url: result.url,
          title: result.title,
          message: `Successfully created GitHub issue #${result.issueNumber}: ${result.title}`,
        });
      } catch (error) {
        logger.error({ err: error, repositoryId, title }, 'createIssue tool failed');
        return JSON.stringify({
          error: `Failed to create GitHub issue: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    {
      name: 'createIssue',
      description: 'Create a GitHub issue on the repository. IMPORTANT: Requires explicit user confirmation (confirmed: true) before calling.',
      schema: z.object({
        title: z.string().describe('The title of the GitHub issue to create'),
        body: z.string().describe('The detailed markdown description/body of the GitHub issue'),
        confirmed: z.boolean().optional().default(false).describe('Set to true ONLY if the user has explicitly confirmed that the issue should be created'),
      }),
    }
  );
}
