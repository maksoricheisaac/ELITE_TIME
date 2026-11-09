import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptActivityLog, decryptUser } from '../lib/prisma-crypto.helper';
import type { Prisma, ActivityType } from '../generated/prisma/client';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(params: {
    page?: number;
    limit?: number;
    type?: string;
    userId?: string;
    from?: string;
    to?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityLogWhereInput = {};
    if (params.type) where.type = params.type as ActivityType;
    if (params.userId) where.userId = params.userId;
    if (params.from || params.to) {
      where.timestamp = {};
      if (params.from) where.timestamp.gte = new Date(params.from);
      if (params.to) where.timestamp.lte = new Date(params.to);
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => decryptActivityLog(l)),
      total,
      page,
      limit,
    };
  }

  async create(
    userId: string | null,
    action: string,
    details: string,
    type: string,
  ) {
    const log = await this.prisma.activityLog.create({
      data: {
        userId,
        action,
        details,
        timestamp: new Date(),
        type: type as ActivityType,
      },
    });
    return decryptActivityLog(log);
  }

  async getEmployees() {
    const users = await this.prisma.user.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        username: true,
        firstname: true,
        lastname: true,
        role: true,
      },
    });
    return users.map((u) => {
      const dec = decryptUser(u);
      return {
        id: dec.id,
        username: dec.username,
        firstname: dec.firstname,
        lastname: dec.lastname,
        role: dec.role,
      };
    });
  }
}
