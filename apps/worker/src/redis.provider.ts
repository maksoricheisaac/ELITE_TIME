import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import IORedis from 'ioredis';

export const REDIS = Symbol('REDIS');

/**
 * Connexion Redis unique du worker. `maxRetriesPerRequest: null` est exigé par
 * BullMQ ; reconnexion automatique avec backoff plafonné à 5 s.
 */
@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: IORedis) {}
  async onApplicationShutdown() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const redis = new IORedis(process.env.REDIS_URL as string, {
          maxRetriesPerRequest: null,
          connectTimeout: 5_000,
          retryStrategy: (times) => Math.min(times * 200, 5_000),
        });
        redis.on('error', () => undefined); // état suivi par les health checks
        return redis;
      },
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisProviderModule {}
