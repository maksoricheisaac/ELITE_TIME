import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elitetime/database';
import { CacheService } from '../redis/cache.service';

const SETTINGS_CACHE_KEY = 'settings:system';
const SETTINGS_CACHE_TTL_S = 60;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async get() {
    return this.cache.getOrSet(
      SETTINGS_CACHE_KEY,
      SETTINGS_CACHE_TTL_S,
      async () => {
        let s = await this.prisma.systemSettings.findFirst();
        if (!s) {
          s = await this.prisma.systemSettings.create({
            data: { ...DEFAULTS, id: 1 },
          });
        }
        return s;
      },
    );
  }

  async update(data: Partial<typeof DEFAULTS>) {
    const existing = await this.prisma.systemSettings.findFirst();
    const result = !existing
      ? await this.prisma.systemSettings.create({
          data: { ...DEFAULTS, ...data, id: 1 },
        })
      : await this.prisma.systemSettings.update({
          where: { id: 1 },
          data: data,
        });
    await this.cache.invalidate(SETTINGS_CACHE_KEY);
    return result;
  }
}
