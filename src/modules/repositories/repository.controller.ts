import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  createRepositorySchema,
  CreateRepositoryInput,
  repositoryParamsSchema,
  RepositoryParams,
  listRepositoriesQuerySchema,
  ListRepositoriesQuery,
} from './repository.schema.js';
import { repositoryService } from './repository.service.js';

export const repositoryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/repositories - Register repository
  fastify.post<{ Body: CreateRepositoryInput }>(
    '/',
    {
      schema: {
        description: 'Connect and queue ingestion for a public GitHub repository',
        tags: ['Repositories'],
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri', example: 'https://github.com/expressjs/express' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              repositoryId: { type: 'string' },
              status: { type: 'string' },
              repository: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  owner: { type: 'string' },
                  name: { type: 'string' },
                  fullName: { type: 'string' },
                  url: { type: 'string' },
                  defaultBranch: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateRepositoryInput }>, reply: FastifyReply) => {
      const validated = createRepositorySchema.parse(request.body);
      const result = await repositoryService.createRepository(validated.url);
      return reply.status(201).send(result);
    }
  );

  // GET /api/repositories - List repositories
  fastify.get<{ Querystring: ListRepositoriesQuery }>(
    '/',
    {
      schema: {
        description: 'List all registered repositories',
        tags: ['Repositories'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListRepositoriesQuery }>, reply: FastifyReply) => {
      const { limit, offset } = listRepositoriesQuerySchema.parse(request.query);
      const repos = await repositoryService.listRepositories(limit, offset);
      return reply.send({ repositories: repos });
    }
  );

  // GET /api/repositories/:id - Get repository details
  fastify.get<{ Params: RepositoryParams }>(
    '/:id',
    {
      schema: {
        description: 'Get repository details by ID',
        tags: ['Repositories'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RepositoryParams }>, reply: FastifyReply) => {
      const { id } = repositoryParamsSchema.parse(request.params);
      const repo = await repositoryService.getRepository(id);
      return reply.send(repo);
    }
  );

  // POST /api/repositories/:id/ingest - Start or restart ingestion
  fastify.post<{ Params: RepositoryParams }>(
    '/:id/ingest',
    {
      schema: {
        description: 'Manually trigger or restart ingestion for a repository',
        tags: ['Repositories'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RepositoryParams }>, reply: FastifyReply) => {
      const { id } = repositoryParamsSchema.parse(request.params);
      const result = await repositoryService.startOrRestartIngestion(id);
      return reply.send({ repositoryId: id, status: result.status, jobId: result.jobId });
    }
  );

  // GET /api/repositories/:id/ingestion - Get ingestion status
  fastify.get<{ Params: RepositoryParams }>(
    '/:id/ingestion',
    {
      schema: {
        description: 'Get repository ingestion progress and statistics',
        tags: ['Repositories'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              repositoryId: { type: 'string' },
              repositoryStatus: { type: 'string' },
              status: { type: 'string' },
              totalFiles: { type: 'integer' },
              processedFiles: { type: 'integer' },
              failedFiles: { type: 'integer' },
              totalChunks: { type: 'integer' },
              startedAt: { type: 'string', nullable: true },
              completedAt: { type: 'string', nullable: true },
              error: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RepositoryParams }>, reply: FastifyReply) => {
      const { id } = repositoryParamsSchema.parse(request.params);
      const status = await repositoryService.getIngestionStatus(id);
      return reply.send(status);
    }
  );
};
