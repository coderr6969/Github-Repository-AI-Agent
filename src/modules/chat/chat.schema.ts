import { z } from 'zod';

export const sendChatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
  conversationId: z.string().uuid('Invalid conversation ID').optional(),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const chatParamsSchema = z.object({
  id: z.string().uuid('Invalid repository ID format'),
});

export type ChatParams = z.infer<typeof chatParamsSchema>;

export const conversationParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID format'),
});

export type ConversationParams = z.infer<typeof conversationParamsSchema>;

export const pullRequestParamsSchema = z.object({
  id: z.string().uuid('Invalid repository ID format'),
  number: z.coerce.number().int().positive('Invalid pull request number'),
});

export type PullRequestParams = z.infer<typeof pullRequestParamsSchema>;

export const createIssueSchema = z.object({
  title: z.string().min(3, 'Title is too short').max(250, 'Title is too long'),
  body: z.string().min(10, 'Body must have at least 10 characters'),
  confirmed: z.boolean().default(false).describe('Explicit confirmation flag required to execute write operation'),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
