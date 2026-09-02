import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request as any).id || 'req-unknown';

  // Handle custom AppError
  if (error instanceof AppError) {
    logger.warn(
      {
        requestId,
        url: request.url,
        method: request.method,
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
      },
      'Application handled error'
    );

    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  // Handle Zod Validation Error
  if (error instanceof ZodError) {
    logger.warn(
      {
        requestId,
        url: request.url,
        method: request.method,
        issues: error.issues,
      },
      'Request schema validation error'
    );

    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
  }

  // Handle Fastify built-in validation errors
  if ((error as any).validation || (error as any).code === 'FST_ERR_VALIDATION') {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Request payload validation failed',
        details: (error as any).validation,
      },
    });
  }

  // Handle Fastify other built-in errors (e.g. 404 router)
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode;
    return reply.status(statusCode).send({
      error: {
        code: (error as any).code || `HTTP_${statusCode}`,
        message: error.message,
      },
    });
  }

  // Unhandled / Internal Server Error
  logger.error(
    {
      requestId,
      url: request.url,
      method: request.method,
      err: error,
    },
    'Unhandled internal server error'
  );

  return reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'production' ? 'An internal server error occurred' : error.message,
    },
  });
}
