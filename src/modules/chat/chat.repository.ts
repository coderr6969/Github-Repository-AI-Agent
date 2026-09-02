import { Conversation, Message, MessageRole, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../infrastructure/database/prisma.js';

export class ChatRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  async createConversation(repositoryId: string, userId?: string): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: {
        repositoryId,
        userId: userId || null,
      },
    });
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async listConversationsByRepository(repositoryId: string, limit = 20, offset = 0): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { repositoryId },
      take: limit,
      skip: offset,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  async saveMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  }

  async getRecentMessages(conversationId: string, limit = 10): Promise<Message[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return messages.reverse();
  }

  async recordAuditLog(repositoryId: string | null, action: string, details?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        repositoryId,
        action,
        details: details ? (details as any) : undefined,
      },
    });
  }
}

export const chatRepository = new ChatRepository();
