import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Client Redis unique de l'API (cache, rate limiting, adaptateur Socket.IO).
 *
 * Politique d'indisponibilité : Redis n'est JAMAIS bloquant.
 *  - REDIS_URL absente        => service désactivé (isAvailable() === false)
 *  - Redis injoignable        => les commandes échouent immédiatement
 *    (enableOfflineQueue: false), les appelants retombent sur leur repli
 *    (cache => base de données, throttler => compteurs mémoire locaux).
 *  - Reconnexion automatique avec backoff plafonné à 5 s.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;
  private ready = false;

  /** Préfixe des clés : permet de partager une instance entre environnements. */
  readonly keyPrefix = process.env.REDIS_KEY_PREFIX ?? 'elitetime:';

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn(
        'REDIS_URL non définie : Redis désactivé (cache, rate limiting distribué et adaptateur Socket.IO inactifs)',
      );
      this.client = null;
      return;
    }

    this.client = new Redis(url, {
      connectTimeout: 5_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });

    this.client.on('ready', () => {
      if (!this.ready) this.logger.log('Redis connecté');
      this.ready = true;
    });
    this.client.on('close', () => {
      if (this.ready)
        this.logger.warn('Connexion Redis perdue (reconnexion automatique)');
      this.ready = false;
    });
    // Évite le crash "Unhandled error event" ; l'état est suivi via ready/close.
    this.client.on('error', () => undefined);
  }

  isAvailable(): boolean {
    return this.client !== null && this.ready;
  }

  /** Attend que Redis soit prêt (utilisé au démarrage pour l'adaptateur Socket.IO). */
  async waitUntilReady(timeoutMs = 3_000): Promise<boolean> {
    const start = Date.now();
    while (!this.isAvailable() && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.isAvailable();
  }

  async ping(): Promise<boolean> {
    if (!this.client || !this.ready) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** Connexion dédiée (pub/sub) : file d'attente hors-ligne autorisée. */
  duplicateForPubSub(): Redis {
    if (!this.client) throw new Error('Redis désactivé');
    const dup = this.client.duplicate({
      enableOfflineQueue: true,
      commandTimeout: undefined,
      maxRetriesPerRequest: null,
    });
    dup.on('error', () => undefined);
    return dup;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }
}
