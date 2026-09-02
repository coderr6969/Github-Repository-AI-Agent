import { PrismaClient, Repository, RepositoryStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../infrastructure/database/prisma.js';

export class RepositoryRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  async create(data: {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    defaultBranch: string;
    description?: string | null;
    status?: RepositoryStatus;
  }): Promise<Repository> {
    return this.prisma.repository.create({
      data: {
        owner: data.owner,
        name: data.name,
        fullName: data.fullName,
        url: data.url,
        defaultBranch: data.defaultBranch,
        description: data.description,
        status: data.status || RepositoryStatus.QUEUED,
      },
    });
  }

  async findById(id: string): Promise<Repository | null> {
    return this.prisma.repository.findUnique({
      where: { id },
      include: {
        _count: {
          select: { files: true },
        },
      },
    });
  }

  async findByFullName(fullName: string): Promise<Repository | null> {
    return this.prisma.repository.findUnique({
      where: { fullName },
    });
  }

  async listAll(limit = 20, offset = 0): Promise<Repository[]> {
    return this.prisma.repository.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { files: true },
        },
      },
    });
  }

  async updateStatus(id: string, status: RepositoryStatus): Promise<Repository> {
    return this.prisma.repository.update({
      where: { id },
      data: { status },
    });
  }

  async updateMetadata(
    id: string,
    data: { description?: string | null; defaultBranch?: string }
  ): Promise<Repository> {
    return this.prisma.repository.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Repository> {
    return this.prisma.repository.delete({
      where: { id },
    });
  }
}

export const repositoryRepository = new RepositoryRepository();
