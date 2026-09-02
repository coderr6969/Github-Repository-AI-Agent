import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database & Cache
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/github_agent?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Qdrant
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('repository_code'),
  VECTOR_DIMENSION: z.coerce.number().default(1536),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),

  // LLM & Embeddings
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'mock', 'custom']).default('openai'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o'),
  LLM_BASE_URL: z.string().optional(),
  LLM_TEMPERATURE: z.coerce.number().default(0.1),

  EMBEDDING_PROVIDER: z.enum(['openai', 'mock', 'custom']).default('openai'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_BASE_URL: z.string().optional(),

  // Operational limits
  MAX_REPOSITORY_SIZE_MB: z.coerce.number().default(50),
  MAX_FILES_PER_REPO: z.coerce.number().default(500),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(60),
  CHAT_HISTORY_LIMIT: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}

export const env = validateEnv();
