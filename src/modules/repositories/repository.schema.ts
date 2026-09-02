import { z } from 'zod';

export const createRepositorySchema = z.object({
  url: z.string().url('A valid URL is required').min(10, 'URL is too short'),
});

export type CreateRepositoryInput = z.infer<typeof createRepositorySchema>;

export const repositoryParamsSchema = z.object({
  id: z.string().uuid('Invalid repository ID format'),
});

export type RepositoryParams = z.infer<typeof repositoryParamsSchema>;

export const listRepositoriesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type ListRepositoriesQuery = z.infer<typeof listRepositoriesQuerySchema>;
