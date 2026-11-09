import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { RedisService } from './redis.service';

/**
 * Adaptateur Socket.IO via Redis : permet plusieurs instances d'API (les
 * émissions vers les rooms atteignent tous les clients). Si Redis n'est pas
 * disponible au démarrage, on conserve l'adaptateur mémoire d'origine.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly redisLogger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    if (!this.redis.client || !(await this.redis.waitUntilReady())) {
      this.redisLogger.warn(
        'Redis indisponible : Socket.IO en mode mono-instance (adaptateur mémoire)',
      );
      return;
    }
    const pub = this.redis.duplicateForPubSub();
    const sub = this.redis.duplicateForPubSub();
    this.adapterConstructor = createAdapter(pub, sub);
    this.redisLogger.log('Adaptateur Socket.IO Redis activé');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options) as {
      adapter: (a: unknown) => void;
    };
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
