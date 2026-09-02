import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';
import { metrics } from '../utils/observability.js';

const requestLoggerPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string) || uuidv4();
    (request as any).id = requestId;
    (request as any).startTime = process.hrtime.bigint();
    reply.header('x-request-id', requestId);
    metrics.incrementRequests();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime as bigint | undefined;
    let durationMs = 0;
    if (startTime) {
      const diff = process.hrtime.bigint() - startTime;
      durationMs = Number(diff) / 1_000_000;
    }

    logger.info(
      {
        requestId: (request as any).id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      },
      `${request.method} ${request.url} ${reply.statusCode} - ${durationMs.toFixed(2)}ms`
    );
  });
};

export const requestLogger = fp(requestLoggerPlugin);
