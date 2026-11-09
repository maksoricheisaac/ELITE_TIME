import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Cache applicatif Redis (fail-open) : toute erreur Redis => on appelle le loader.
 * Les valeurs sont sérialisées en JSON (les Date deviennent des chaînes ISO ;
 * n'y mettre que des données destinées à être sérialisées en JSON).
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  private k(key: string) {
    return `${this.redis.keyPrefix}cache:${key}`;
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const client = this.redis.client;
    if (client && this.redis.isAvailable()) {
      try {
        const hit = await client.get(this.k(key));
        if (hit !== null) return JSON.parse(hit) as T;
      } catch (e) {
        this.logger.debug(`cache get ${key} ignoré : ${(e as Error).message}`);
      }
    }

    const value = await loader();

    if (client && this.redis.isAvailable() && value !== undefined) {
      client
        .set(this.k(key), JSON.stringify(value), 'EX', ttlSeconds)
        .catch((e: Error) =>
          this.logger.debug(`cache set ${key} ignoré : ${e.message}`),
        );
    }
    return value;
  }

  async invalidate(...keys: string[]): Promise<void> {
    const client = this.redis.client;
    if (!client || !this.redis.isAvailable() || keys.length === 0) return;
    try {
      await client.del(...keys.map((x) => this.k(x)));
    } catch (e) {
      this.logger.warn(
        `invalidation cache impossible (${keys.join(',')}) : ${(e as Error).message} — expiration par TTL`,
      );
    }
  }
}
