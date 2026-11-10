import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@elitetime/database';
import { encrypt, decrypt } from '@elitetime/shared';
import { decryptBreak } from '@elitetime/shared';
import {
  dayEnd,
  dayKeyOf,
  dayStart,
  formatHM,
  isValidDayKey,
  minuteOfDay,
  parseHM,
} from '@elitetime/time';
import { WorkTimeService } from '../work-time/work-time.service';

@Injectable()
export class BreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workTime: WorkTimeService,
  ) {}

  private todayBounds() {
    const day = dayKeyOf(new Date(), this.workTime.tz);
    return {
      day,
      range: {
        gte: dayStart(day, this.workTime.tz),
        lte: dayEnd(day, this.workTime.tz),
      },
    };
  }

  async getTodayBreaks(userId: string) {
    const { range } = this.todayBounds();
    const rows = await this.prisma.break.findMany({
      where: { userId, date: range },
    });
    return rows.map((b) => decryptBreak(b));
  }

  async getRange(userId: string, from: string, to: string) {
    if (!isValidDayKey(from) || !isValidDayKey(to) || from > to) {
      throw new BadRequestException('Période invalide (AAAA-MM-JJ attendu)');
    }
    const tz = this.workTime.tz;
    const rows = await this.prisma.break.findMany({
      where: {
        userId,
        date: { gte: dayStart(from, tz), lte: dayEnd(to, tz) },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((b) => decryptBreak(b));
  }

  async start(userId: string) {
    const { range } = this.todayBounds();
    const now = new Date();
    const startTime = formatHM(minuteOfDay(now, this.workTime.tz));

    // Verrou par employé : deux clics simultanés ne créent pas deux pauses ouvertes.
    const b = await this.workTime.withUserLock(userId, async (tx) => {
      const activeBreak = await tx.break.findFirst({
        where: { userId, date: range, endTime: null },
      });
      if (activeBreak) {
        throw new BadRequestException('Une pause est déjà en cours');
      }
      return tx.break.create({
        data: { userId, date: now, startTime: encrypt(startTime) },
      });
    });
    return decryptBreak(b);
  }

  async end(userId: string) {
    const { day, range } = this.todayBounds();

    const updated = await this.workTime.withUserLock(userId, async (tx) => {
      const activeBreak = await tx.break.findFirst({
        where: { userId, date: range, endTime: null },
      });
      if (!activeBreak) return null;

      const endTime = formatHM(minuteOfDay(new Date(), this.workTime.tz));
      const startMin = parseHM(decrypt(activeBreak.startTime));
      const endMin = parseHM(endTime)!;
      // Jamais de durée négative ni NaN : une pause illisible compte 0.
      const duration = startMin === null ? 0 : Math.max(0, endMin - startMin);

      const row = await tx.break.update({
        where: { id: activeBreak.id },
        data: { endTime: encrypt(endTime), duration },
      });
      // La pause change le temps travaillé de la journée : on remet les durées en accord.
      await this.workTime.recomputeDay(userId, day, tx);
      return row;
    });
    return updated ? decryptBreak(updated) : null;
  }
}
