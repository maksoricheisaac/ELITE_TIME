import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt } from '../lib/crypto';

@Injectable()
export class EmailSchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const jobs = await this.prisma.scheduledEmailJob.findMany({
      include: {
        recipients: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
      },
    });
    return jobs;
  }

  async update(data: {
    type: 'DAILY_REPORT' | 'WEEKLY_REPORT' | 'MONTHLY_REPORT';
    enabled: boolean;
    hour: number;
    minute: number;
    weekday?: number;
    weekStartDay?: number;
    monthlySendDay?: number;
    includePdf?: boolean;
    includeExcel?: boolean;
    includeCsv?: boolean;
    recipientUserIds?: string[];
    recipientEmails?: string[];
  }) {
    const job = await this.prisma.scheduledEmailJob.upsert({
      where: { type: data.type },
      update: {
        enabled: data.enabled,
        hour: data.hour,
        minute: data.minute,
        weekday: data.weekday ?? null,
        weekStartDay: data.weekStartDay ?? 1,
        monthlySendDay: data.monthlySendDay ?? 1,
        includePdf: data.includePdf ?? true,
        includeExcel: data.includeExcel ?? false,
        includeCsv: data.includeCsv ?? false,
      },
      create: {
        type: data.type,
        enabled: data.enabled,
        hour: data.hour,
        minute: data.minute,
        weekday: data.weekday ?? null,
        weekStartDay: data.weekStartDay ?? 1,
        monthlySendDay: data.monthlySendDay ?? 1,
        includePdf: data.includePdf ?? true,
        includeExcel: data.includeExcel ?? false,
        includeCsv: data.includeCsv ?? false,
      },
    });

    // Update recipients
    await this.prisma.scheduledEmailJobRecipient.deleteMany({
      where: { jobId: job.id },
    });

    const recipientData: any[] = [];
    if (data.recipientUserIds?.length) {
      recipientData.push(
        ...data.recipientUserIds.map((userId) => ({ jobId: job.id, userId })),
      );
    }
    if (data.recipientEmails?.length) {
      recipientData.push(
        ...data.recipientEmails.map((email) => ({
          jobId: job.id,
          email: encrypt(email.toLowerCase().trim()),
        })),
      );
    }
    if (recipientData.length) {
      await this.prisma.scheduledEmailJobRecipient.createMany({
        data: recipientData,
        skipDuplicates: true,
      });
    }

    return this.prisma.scheduledEmailJob.findUnique({
      where: { id: job.id },
      include: { recipients: true },
    });
  }
}
