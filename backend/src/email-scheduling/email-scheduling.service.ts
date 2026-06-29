import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from '../lib/crypto';
import { decryptUser } from '../lib/prisma-crypto.helper';

@Injectable()
export class EmailSchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const [jobs, rawUsers, settings] = await Promise.all([
      this.prisma.scheduledEmailJob.findMany({
        include: {
          recipients: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  firstname: true,
                  lastname: true,
                  role: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { status: 'active', hiddenFromLists: false },
        select: {
          id: true,
          username: true,
          email: true,
          firstname: true,
          lastname: true,
          role: true,
        },
      }),
      this.prisma.systemSettings.findFirst({
        select: { timezone: true, dailyReportMode: true },
      }),
    ]);

    const eligibleUsers = rawUsers.map((u) => {
      const dec = decryptUser(u as any);
      return {
        id: u.id,
        username: u.username,
        email: dec.email ?? null,
        firstname: dec.firstname ?? null,
        lastname: dec.lastname ?? null,
        role: u.role,
      };
    });

    const findJob = (type: string) => {
      const job = jobs.find((j) => j.type === type);
      if (!job) return null;
      const recipientUserIds = job.recipients
        .filter((r) => r.userId)
        .map((r) => r.userId as string);
      const recipientEmails = job.recipients
        .filter((r) => !r.userId && r.email)
        .map((r) => {
          try {
            return decrypt(r.email as string);
          } catch {
            return r.email as string;
          }
        });
      return {
        id: job.id,
        enabled: job.enabled,
        hour: job.hour,
        minute: job.minute,
        weekday: job.weekday ?? undefined,
        weekStartDay: job.weekStartDay ?? 1,
        monthlySendDay: job.monthlySendDay ?? 1,
        includePdf: job.includePdf,
        includeExcel: job.includeExcel,
        includeCsv: job.includeCsv,
        recipientUserIds,
        recipientEmails,
      };
    };

    return {
      eligibleUsers,
      timezone: settings?.timezone ?? 'Europe/Paris',
      dailyReportMode: (settings?.dailyReportMode ?? 'YESTERDAY') as
        | 'TODAY'
        | 'YESTERDAY',
      daily: findJob('DAILY_REPORT'),
      weekly: findJob('WEEKLY_REPORT'),
      monthly: findJob('MONTHLY_REPORT'),
    };
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
