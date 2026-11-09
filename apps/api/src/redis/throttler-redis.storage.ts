import { Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { RedisService } from './redis.service';

/**
 * Compteurs de rate limiting partagés entre instances (Redis).
 * Opération atomique (script Lua). Si Redis est indisponible, repli sur le
 * stockage mémoire local de @nestjs/throttler : la limitation reste active
 * (par instance) au lieu de bloquer ou de laisser tout passer.
 */
const LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local block = redis.call('PTTL', KEYS[2])
if block <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  block = tonumber(ARGV[3])
end
if block < 0 then block = 0 end
return {hits, ttl, block}
`;

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('ThrottlerStorage');
  private readonly fallback = new ThrottlerStorageService();
  private degraded = false;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redis.client;
    if (client && this.redis.isAvailable()) {
      try {
        const base = `${this.redis.keyPrefix}throttle:${throttlerName}:${key}`;
        const [hits, ttlMs, blockMs] = (await client.eval(
          LUA,
          2,
          base,
          `${base}:block`,
          String(ttl),
          String(limit),
          String(Math.max(blockDuration, 1)),
        )) as [number, number, number];
        if (this.degraded) {
          this.degraded = false;
          this.logger.log('Rate limiting redevenu distribué (Redis)');
        }
        return {
          totalHits: hits,
          timeToExpire: Math.max(Math.ceil(ttlMs / 1000), 0),
          isBlocked: blockMs > 0,
          timeToBlockExpire: Math.ceil(blockMs / 1000),
        };
      } catch (e) {
        this.markDegraded((e as Error).message);
      }
    } else {
      this.markDegraded('Redis indisponible');
    }
    return this.fallback.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );
  }

  private markDegraded(reason: string) {
    if (!this.degraded) {
      this.degraded = true;
      this.logger.warn(
        `Rate limiting en mode local (par instance) : ${reason}`,
      );
    }
  }
}
