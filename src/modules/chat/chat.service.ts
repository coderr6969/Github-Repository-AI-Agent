import { MessageRole } from '@prisma/client';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, ConfirmationRequiredError } from '../../utils/errors.js';
import { parseGitHubUrl } from '../../utils/github-url.js';
import { startTimer } from '../../utils/observability.js';
import { repositoryRepository, RepositoryRepository } from '../repositories/repository.repository.js';
import { chatRepository, ChatRepository } from './chat.repository.js';
import { buildAgentGraph } from '../agent/graph.js';
import { getGitHubClient } from '../github/github.service.js';
import { IGitHubClient } from '../github/github.interface.js';
import { ChatResponsePayload, FileReference } from '../../types/index.js';

export class ChatService {
  constructor(
    private repoRepo: RepositoryRepository = repositoryRepository,
    private chatRepo: ChatRepository = chatRepository,
    private ghClient: IGitHubClient = getGitHubClient()
  ) {}

  async askQuestion(
    repositoryId: string,
    questionText: string,
    existingConversationId?: string
  ): Promise<{ conversationId: string } & ChatResponsePayload> {
    const timer = startTimer();
    logger.info({ repositoryId, conversationId: existingConversationId, question: questionText }, 'Processing chat message');

    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }

    // 1. Retrieve or create conversation
    let conversationId = existingConversationId;
    if (conversationId) {
      const existingConv = await this.chatRepo.getConversation(conversationId);
      if (!existingConv) {
        throw new NotFoundError(`Conversation not found: ${conversationId}`, 'CONVERSATION_NOT_FOUND');
      }
    } else {
      const newConv = await this.chatRepo.createConversation(repositoryId);
      conversationId = newConv.id;
    }

    // 2. Load recent history
    const recentMessages = await this.chatRepo.getRecentMessages(conversationId, env.CHAT_HISTORY_LIMIT);
    const historyMessages: BaseMessage[] = recentMessages.map((m) => {
      if (m.role === 'user') return new HumanMessage(m.content);
      return new AIMessage(m.content);
    });

    historyMessages.push(new HumanMessage(questionText));

    // 3. Invoke LangGraph Agent
    const graph = buildAgentGraph(repositoryId);
    const result = await graph.invoke({
      repositoryId,
      question: questionText,
      messages: historyMessages,
    });

    const durationMs = timer.stop();

    // 4. Save User & Assistant Messages
    await this.chatRepo.saveMessage(conversationId, MessageRole.user, questionText);
    await this.chatRepo.saveMessage(conversationId, MessageRole.assistant, result.answer, {
      references: result.references,
      toolsUsed: result.toolsUsed,
      durationMs,
    });

    logger.info(
      {
        repositoryId,
        conversationId,
        toolsUsed: result.toolsUsed,
        referenceCount: result.references.length,
        durationMs,
      },
      'Chat response completed'
    );

    return {
      conversationId,
      answer: result.answer,
      references: result.references,
      toolsUsed: result.toolsUsed,
      metrics: {
        totalDurationMs: durationMs,
        llmCalls: 1,
      },
    };
  }

  async getConversations(repositoryId: string, limit = 20, offset = 0) {
    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }
    return this.chatRepo.listConversationsByRepository(repositoryId, limit, offset);
  }

  async getConversationMessages(conversationId: string) {
    const conv = await this.chatRepo.getConversation(conversationId);
    if (!conv) {
      throw new NotFoundError(`Conversation not found: ${conversationId}`, 'CONVERSATION_NOT_FOUND');
    }
    return conv;
  }

  async getPullRequestDetails(repositoryId: string, prNumber: number) {
    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }

    const { owner, repo: repoName } = parseGitHubUrl(repo.url);
    const gh = getGitHubClient();
    return gh.getPullRequest(owner, repoName, prNumber);
  }

  async createIssue(
    repositoryId: string,
    title: string,
    body: string,
    confirmed = false
  ) {
    const repo = await this.repoRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`, 'REPOSITORY_NOT_FOUND');
    }

    if (!confirmed) {
      throw new ConfirmationRequiredError(
        'GitHub issue creation is a write action that modifies the repository. Set "confirmed: true" to proceed.',
        {
          proposedIssue: {
            repository: repo.fullName,
            title,
            body,
          },
        }
      );
    }

    const { owner, repo: repoName } = parseGitHubUrl(repo.url);
    const gh = getGitHubClient();
    const result = await gh.createIssue(owner, repoName, title, body);

    await this.chatRepo.recordAuditLog(repositoryId, 'CREATE_GITHUB_ISSUE', {
      title,
      issueNumber: result.issueNumber,
      url: result.url,
    });

    return result;
  }
}

export const chatService = new ChatService();
