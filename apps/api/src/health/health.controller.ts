import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '@elitetime/database';
import { RedisService } from '../redis/redis.service';

/**
 * Sondes de santé (publiques, sans information sensible).
 *  - GET /api/health/live : le processus répond (liveness)
 *  - GET /api/health      : readiness — 503 si PostgreSQL est indisponible ;
 *                           Redis indisponible => "degraded" (200), car non bloquant.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get()
  async ready(@Res({ passthrough: true }) res: Response) {
    const database = await this.checkDatabase();
    const redis = !this.redis.client
      ? 'disabled'
      : (await this.redis.ping())
        ? 'up'
        : 'down';

    const status =
      database !== 'up' ? 'error' : redis === 'down' ? 'degraded' : 'ok';
    if (status === 'error') res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status,
      uptime: Math.round(process.uptime()),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), 3_000),
        ),
      ]);
      return 'up';
    } catch {
      return 'down';
    }
  }
}
