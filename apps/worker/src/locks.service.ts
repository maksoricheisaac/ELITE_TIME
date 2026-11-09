import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';
import { REDIS } from './redis.provider';

/**
 * Idempotence entre instances : `once(key, ttl)` renvoie true pour UN SEUL appelant
 * (SET NX EX) pendant `ttl` secondes. Remplace les états en mémoire de l'ancien
 * SchedulerService (lastAutoCloseDate, lastEmailRunByJobId).
 */
@Injectable()
export class LocksService {
  private readonly prefix = process.env.REDIS_KEY_PREFIX ?? 'elitetime:';

  constructor(@Inject(REDIS) private readonly redis: IORedis) {}

  async once(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(
      `${this.prefix}worker:once:${key}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return res === 'OK';
  }
}
