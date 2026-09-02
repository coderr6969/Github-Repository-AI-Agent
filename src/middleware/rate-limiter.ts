import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { getRedisClient } from '../infrastructure/redis/redis.client.js';

const rateLimiterPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  let redisConnection: any = undefined;
  if (env.NODE_ENV !== 'test') {
    try {
      redisConnection = getRedisClient();
    } catch {
      // fallback to memory
    }
  }

  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    redis: redisConnection,
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Maximum allowed is ${env.RATE_LIMIT_PER_MINUTE} requests per minute.`,
      },
    }),
  });
};

export const rateLimiter = fp(rateLimiterPlugin);
