import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../config/logger.js';
import { getGitHubClient } from '../../github/github.service.js';
import { parseGitHubUrl } from '../../../utils/github-url.js';
import { repositoryRepository } from '../../repositories/repository.repository.js';
import { ingestionRepository } from '../../ingestion/ingestion.repository.js';
import { startTimer } from '../../../utils/observability.js';

export function createAnalyzeDependenciesTool(repositoryId: string) {
  return tool(
    async ({ filePath }: { filePath?: string }) => {
      const timer = startTimer();
      logger.info({ repositoryId, filePath }, 'Executing analyzeDependencies tool');

      try {
        const repo = await repositoryRepository.findById(repositoryId);
        if (!repo) {
          return JSON.stringify({ error: `Repository ${repositoryId} not found in database.` });
        }

        const { owner, repo: repoName } = parseGitHubUrl(repo.url);
        const gh = getGitHubClient();
        
        let repoFiles: any[] = [];
        try {
          repoFiles = await ingestionRepository.getRepositoryFiles(repositoryId);
        } catch {
          repoFiles = [];
        }

        let packageDeps: Record<string, string> = {};
        try {
          const pkgFile = await gh.getFile(owner, repoName, 'package.json', repo.defaultBranch);
          const parsed = JSON.parse(pkgFile.content);
          packageDeps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
        } catch {
          // package.json might not exist for non-Node repositories
        }

        let targetFileContent: string | null = null;
        if (filePath) {
          try {
            const fileObj = await gh.getFile(owner, repoName, filePath, repo.defaultBranch);
            targetFileContent = fileObj.content;
          } catch {
            return JSON.stringify({ error: `File "${filePath}" not found in repository.` });
          }
        }

        const internalImports: string[] = [];
        const externalDependencies: string[] = [];

        if (targetFileContent) {
          // Extract import and require statements
          const importRegex = /(?:import\s+(?:[\w\s{},*]+)\s+from\s+['"]([^'"]+)['"])|(?:require\(['"]([^'"]+)['"]\))/g;
          let match: RegExpExecArray | null;
          while ((match = importRegex.exec(targetFileContent)) !== null) {
            const importPath = match[1] || match[2];
            if (importPath.startsWith('.') || importPath.startsWith('/')) {
              internalImports.push(importPath);
            } else {
              externalDependencies.push(importPath);
            }
          }

          // Also check for Python imports if python file
          if (filePath?.endsWith('.py')) {
            const pyRegex = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
            while ((match = pyRegex.exec(targetFileContent)) !== null) {
              const pyModule = match[1] || match[2];
              if (pyModule.startsWith('.')) {
                internalImports.push(pyModule);
              } else {
                externalDependencies.push(pyModule);
              }
            }
          }
        }

        // Find potential dependents across indexed files if target filePath specified
        const dependentFiles: string[] = [];
        if (filePath) {
          const baseName = filePath.replace(/\.[^/.]+$/, '').split('/').pop();
          if (baseName) {
            for (const f of repoFiles) {
              if (f.path !== filePath && (f.path.includes(baseName) || f.path.endsWith('.ts') || f.path.endsWith('.js'))) {
                dependentFiles.push(f.path);
              }
            }
          }
        }

        logger.info({ repositoryId, filePath, durationMs: timer.stop() }, 'analyzeDependencies tool completed');

        return JSON.stringify({
          analyzedFile: filePath || 'repository_root',
          totalIndexedFiles: repoFiles.length,
          externalPackagesInstalled: Object.keys(packageDeps).length > 0 ? Object.keys(packageDeps) : undefined,
          fileDirectInternalImports: internalImports,
          fileDirectExternalDependencies: externalDependencies,
          potentialDependentFiles: dependentFiles.slice(0, 10),
          summary: filePath
            ? `File "${filePath}" imports ${internalImports.length} local modules and ${externalDependencies.length} packages.`
            : `Repository has ${repoFiles.length} indexed files and ${Object.keys(packageDeps).length} declared dependencies in package.json.`,
        });
      } catch (error) {
        logger.error({ err: error, repositoryId }, 'analyzeDependencies tool failed');
        return JSON.stringify({
          error: `Dependency analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    {
      name: 'analyzeDependencies',
      description: 'Analyze package.json dependencies, module imports, and cross-file dependencies in the repository.',
      schema: z.object({
        filePath: z.string().optional().describe('Optional specific file path to inspect module imports and find dependents (e.g. "src/auth/jwt.ts")'),
      }),
    }
  );
}
