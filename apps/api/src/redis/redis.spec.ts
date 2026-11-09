import { CacheService } from './cache.service';
import { RedisThrottlerStorage } from './throttler-redis.storage';
import type { RedisService } from './redis.service';

// Redis désactivé (aucune REDIS_URL) : aucun accès réseau dans ces tests.
const disabledRedis = {
  client: null,
  keyPrefix: 'test:',
  isAvailable: () => false,
} as unknown as RedisService;

describe('Redis indisponible (fail-open)', () => {
  it('CacheService appelle le loader quand Redis est absent', async () => {
    const cache = new CacheService(disabledRedis);
    const loader = jest.fn().mockResolvedValue({ a: 1 });
    await expect(cache.getOrSet('k', 60, loader)).resolves.toEqual({ a: 1 });
    await expect(cache.getOrSet('k', 60, loader)).resolves.toEqual({ a: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('CacheService.invalidate ne lève pas', async () => {
    await expect(
      new CacheService(disabledRedis).invalidate('k'),
    ).resolves.toBeUndefined();
  });

  it('le throttler bascule sur le comptage mémoire et finit par bloquer', async () => {
    const storage = new RedisThrottlerStorage(disabledRedis);
    let last = await storage.increment('t', 60_000, 3, 60_000, 'default');
    for (let i = 0; i < 4; i++) {
      last = await storage.increment('t', 60_000, 3, 60_000, 'default');
    }
    expect(last.isBlocked).toBe(true);
  });
});
