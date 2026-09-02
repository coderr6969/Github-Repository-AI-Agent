import pino from 'pino';
import { env } from './env.js';

const SENSITIVE_KEYS = ['authorization', 'github_token', 'apiKey', 'token', 'secret', 'password'];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: SENSITIVE_KEYS.concat(SENSITIVE_KEYS.map((k) => `*.${k}`)),
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
