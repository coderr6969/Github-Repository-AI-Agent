import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  sendChatMessageSchema,
  SendChatMessageInput,
  chatParamsSchema,
  ChatParams,
  conversationParamsSchema,
  ConversationParams,
  pullRequestParamsSchema,
  PullRequestParams,
  createIssueSchema,
  CreateIssueInput,
} from './chat.schema.js';
import { chatService } from './chat.service.js';

export const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/repositories/:id/chat - Ask question to repository AI agent
  fastify.post<{ Params: ChatParams; Body: SendChatMessageInput }>(
    '/repositories/:id/chat',
    {
      schema: {
        description: 'Ask a natural language question about an indexed GitHub repository',
        tags: ['Chat & AI Agent'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', example: 'Where is JWT authentication implemented?' },
            conversationId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              conversationId: { type: 'string' },
              answer: { type: 'string' },
              references: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    file: { type: 'string' },
                    startLine: { type: 'integer', nullable: true },
                    endLine: { type: 'integer', nullable: true },
                  },
                },
              },
              toolsUsed: {
                type: 'array',
                items: { type: 'string' },
              },
              metrics: {
                type: 'object',
                properties: {
                  totalDurationMs: { type: 'number' },
                  llmCalls: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ChatParams; Body: SendChatMessageInput }>, reply: FastifyReply) => {
      const { id } = chatParamsSchema.parse(request.params);
      const { message, conversationId } = sendChatMessageSchema.parse(request.body);

      const result = await chatService.askQuestion(id, message, conversationId);
      return reply.send(result);
    }
  );

  // GET /api/repositories/:id/conversations - List conversations
  fastify.get<{ Params: ChatParams }>(
    '/repositories/:id/conversations',
    {
      schema: {
        description: 'List conversation history for a repository',
        tags: ['Chat & AI Agent'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ChatParams }>, reply: FastifyReply) => {
      const { id } = chatParamsSchema.parse(request.params);
      const conversations = await chatService.getConversations(id);
      return reply.send({ conversations });
    }
  );

  // GET /api/conversations/:id - Get conversation with messages
  fastify.get<{ Params: ConversationParams }>(
    '/conversations/:id',
    {
      schema: {
        description: 'Get full conversation messages and metadata',
        tags: ['Chat & AI Agent'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ConversationParams }>, reply: FastifyReply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const conversation = await chatService.getConversationMessages(id);
      return reply.send(conversation);
    }
  );

  // GET /api/repositories/:id/pulls/:number - Get Pull Request
  fastify.get<{ Params: PullRequestParams }>(
    '/repositories/:id/pulls/:number',
    {
      schema: {
        description: 'Fetch pull request details and diff from GitHub',
        tags: ['GitHub Actions'],
        params: {
          type: 'object',
          required: ['id', 'number'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            number: { type: 'integer' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: PullRequestParams }>, reply: FastifyReply) => {
      const { id, number } = pullRequestParamsSchema.parse(request.params);
      const pr = await chatService.getPullRequestDetails(id, number);
      return reply.send(pr);
    }
  );

  // POST /api/repositories/:id/issues - Create Issue with Confirmation
  fastify.post<{ Params: ChatParams; Body: CreateIssueInput }>(
    '/repositories/:id/issues',
    {
      schema: {
        description: 'Create a GitHub issue (requires explicit confirmation: true)',
        tags: ['GitHub Actions'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['title', 'body', 'confirmed'],
          properties: {
            title: { type: 'string', example: 'Bug: Missing null check in auth header parser' },
            body: { type: 'string', example: 'In src/middleware/auth.ts, authorization header check should handle null.' },
            confirmed: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ChatParams; Body: CreateIssueInput }>, reply: FastifyReply) => {
      const { id } = chatParamsSchema.parse(request.params);
      const { title, body, confirmed } = createIssueSchema.parse(request.body);

      const result = await chatService.createIssue(id, title, body, confirmed);
      return reply.status(201).send(result);
    }
  );
};
