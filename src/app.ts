import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { repositoryRoutes } from './modules/repositories/repository.controller.js';
import { chatRoutes } from './modules/chat/chat.controller.js';
import { checkDatabaseHealth } from './infrastructure/database/prisma.js';
import { checkRedisHealth } from './infrastructure/redis/redis.client.js';
import { qdrantService } from './infrastructure/qdrant/qdrant.service.js';
import { metrics } from './utils/observability.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Using our structured request-logger plugin
    trustProxy: true,
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Security Plugins
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  // Request tracing & logging
  await app.register(requestLogger);

  // Rate Limiting
  await app.register(rateLimiter);

  // OpenAPI Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'GitHub Repository AI Agent API',
        description: 'Production-ready MVP backend for indexing and questioning GitHub repositories using LangGraph and RAG',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'System', description: 'Health check and observability' },
        { name: 'Repositories', description: 'Repository registration and ingestion' },
        { name: 'Chat & AI Agent', description: 'Natural language querying with LangGraph RAG' },
        { name: 'GitHub Actions', description: 'Pull request inspection and issue creation' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health Check Endpoint
  app.get(
    '/health',
    {
      schema: {
        description: 'Check service and infrastructure health status',
        tags: ['System'],
      },
    },
    async (_request, reply) => {
      let dbHealthy = false;
      let redisHealthy = false;
      let qdrantHealthy = false;

      if (env.NODE_ENV !== 'test') {
        [dbHealthy, redisHealthy, qdrantHealthy] = await Promise.all([
          checkDatabaseHealth(),
          checkRedisHealth(),
          qdrantService.healthCheck(),
        ]);
      } else {
        dbHealthy = true;
        redisHealthy = true;
        qdrantHealthy = true;
      }

      const allHealthy = dbHealthy && redisHealthy && qdrantHealthy;
      const statusCode = allHealthy ? 200 : 503;

      return reply.status(statusCode).send({
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        dependencies: {
          database: dbHealthy,
          redis: redisHealthy,
          qdrant: qdrantHealthy,
        },
      });
    }
  );

  // Observability Metrics Endpoint
  app.get(
    '/metrics',
    {
      schema: {
        description: 'Retrieve operational and LLM usage metrics',
        tags: ['System'],
      },
    },
    async () => {
      return metrics.getMetrics();
    }
  );

  // Application Routes
  await app.register(repositoryRoutes, { prefix: '/api/repositories' });
  await app.register(chatRoutes, { prefix: '/api' });

  return app;
}
