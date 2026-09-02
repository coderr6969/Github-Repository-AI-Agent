import { IGitHubClient } from './github.interface.js';
import { GitHubClient } from './github.client.js';

let defaultClient: IGitHubClient = new GitHubClient();

export function setGitHubClient(client: IGitHubClient): void {
  defaultClient = client;
}

export function getGitHubClient(): IGitHubClient {
  return defaultClient;
}
