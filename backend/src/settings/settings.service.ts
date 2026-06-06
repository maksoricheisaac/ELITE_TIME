import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULTS = {
  workStartTime: '08:45',
  workEndTime: '17:30',
  maxSessionEndTime: '20:00',
  breakDuration: 60,
  overtimeThreshold: 480,
  holidays: [],
  emailNotificationsEnabled: true,
  lateAlertsEnabled: true,
  notificationsEnabled: true,
  pointageRemindersEnabled: true,
  ldapSyncEnabled: false,
  ldapSyncIntervalMinutes: 60,
  dailyReportMode: 'YESTERDAY' as const,
  timezone: 'Europe/Paris',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    let s = await this.prisma.systemSettings.findFirst();
    if (!s) {
      s = await this.prisma.systemSettings.create({
        data: { ...DEFAULTS, id: 1 },
      });
    }
    return s;
  }

  async update(data: Partial<typeof DEFAULTS>) {
    const existing = await this.prisma.systemSettings.findFirst();
    if (!existing) {
      return this.prisma.systemSettings.create({
        data: { ...DEFAULTS, ...data, id: 1 },
      });
    }
    return this.prisma.systemSettings.update({
      where: { id: 1 },
      data: data,
    });
  }
}
