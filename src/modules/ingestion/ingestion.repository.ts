import { IngestionJob, IngestionStatus, PrismaClient, RepositoryFile } from '@prisma/client';
import { prisma as defaultPrisma } from '../../infrastructure/database/prisma.js';

export class IngestionRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  async createJob(repositoryId: string): Promise<IngestionJob> {
    return this.prisma.ingestionJob.create({
      data: {
        repositoryId,
        status: IngestionStatus.QUEUED,
        startedAt: new Date(),
      },
    });
  }

  async getJobById(id: string): Promise<IngestionJob | null> {
    return this.prisma.ingestionJob.findUnique({
      where: { id },
    });
  }

  async getLatestJobByRepositoryId(repositoryId: string): Promise<IngestionJob | null> {
    return this.prisma.ingestionJob.findFirst({
      where: { repositoryId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateJob(
    id: string,
    data: Partial<{
      status: IngestionStatus;
      totalFiles: number;
      processedFiles: number;
      failedFiles: number;
      totalChunks: number;
      error: string | null;
      startedAt: Date;
      completedAt: Date;
    }>
  ): Promise<IngestionJob> {
    return this.prisma.ingestionJob.update({
      where: { id },
      data,
    });
  }

  async saveRepositoryFiles(
    repositoryId: string,
    files: Array<{ path: string; language: string; size: number; sha?: string }>
  ): Promise<void> {
    // Delete existing files for idempotency
    await this.prisma.repositoryFile.deleteMany({
      where: { repositoryId },
    });

    if (files.length === 0) return;

    await this.prisma.repositoryFile.createMany({
      data: files.map((f) => ({
        repositoryId,
        path: f.path,
        language: f.language,
        size: f.size,
        sha: f.sha,
        indexedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  async getRepositoryFiles(repositoryId: string): Promise<RepositoryFile[]> {
    return this.prisma.repositoryFile.findMany({
      where: { repositoryId },
      orderBy: { path: 'asc' },
    });
  }
}

export const ingestionRepository = new IngestionRepository();
