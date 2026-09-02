import { ValidationError } from './errors.js';
import { ParsedGitHubUrl } from '../types/index.js';

const GITHUB_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

export function parseGitHubUrl(rawUrl: string): ParsedGitHubUrl {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new ValidationError('GitHub repository URL is required', 'INVALID_URL');
  }

  const trimmed = rawUrl.trim();
  const match = trimmed.match(GITHUB_URL_REGEX);

  if (!match) {
    throw new ValidationError(
      `Invalid GitHub repository URL: "${rawUrl}". Expected format: https://github.com/owner/repository`,
      'INVALID_GITHUB_URL'
    );
  }

  const owner = match[1];
  let repo = match[2];

  if (repo.endsWith('.git')) {
    repo = repo.substring(0, repo.length - 4);
  }

  if (!owner || !repo) {
    throw new ValidationError('Could not extract owner and repository name from URL', 'INVALID_GITHUB_URL');
  }

  const fullName = `${owner}/${repo}`;
  const url = `https://github.com/${fullName}`;

  return {
    owner,
    repo,
    fullName,
    url,
  };
}
