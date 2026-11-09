import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from '../lib/crypto';
import { decryptBreak } from '../lib/prisma-crypto.helper';

@Injectable()
export class BreaksService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayBreaks(userId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const rows = await this.prisma.break.findMany({
      where: { userId, date: { gte: start, lte: end } },
    });
    return rows.map((b) => decryptBreak(b));
  }

  async start(userId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const activeBreak = await this.prisma.break.findFirst({
      where: { userId, date: { gte: start, lte: end }, endTime: null },
    });
    if (activeBreak) {
      throw new BadRequestException('Une pause est déjà en cours');
    }

    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);
    const b = await this.prisma.break.create({
      data: { userId, date: now, startTime: encrypt(startTime) },
    });
    return decryptBreak(b);
  }

  async end(userId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const activeBreak = await this.prisma.break.findFirst({
      where: { userId, date: { gte: start, lte: end }, endTime: null },
    });
    if (!activeBreak) return null;

    const now = new Date();
    const endTime = now.toTimeString().slice(0, 5);
    const startTime = decrypt(activeBreak.startTime);
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const duration = Math.max(0, eh * 60 + em - (sh * 60 + sm));

    const updated = await this.prisma.break.update({
      where: { id: activeBreak.id },
      data: { endTime: encrypt(endTime), duration },
    });
    return decryptBreak(updated);
  }
}
