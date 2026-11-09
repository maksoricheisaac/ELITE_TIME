import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type IORedis from 'ioredis';
import { PrismaService } from '@elitetime/database';
import { REDIS } from './redis.provider';
import { WorkerMetrics } from './metrics.service';

/**
 * Petit serveur HTTP interne (non publié sur Internet) :
 *   GET /health  -> 200 si PostgreSQL et Redis répondent, sinon 503
 *   GET /metrics -> format texte Prometheus
 * Aucune donnée sensible n'est exposée.
 */
@Injectable()
export class HealthServer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(HealthServer.name);
  private server?: Server;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: IORedis,
    private readonly metrics: WorkerMetrics,
  ) {}

  onApplicationBootstrap() {
    const port = Number(process.env.WORKER_HEALTH_PORT ?? 4100);
    const host = process.env.WORKER_HEALTH_HOST ?? '0.0.0.0';

    this.server = createServer((req, res) => {
      void (async () => {
        if (req.url === '/metrics') {
          res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
          res.end(await this.metrics.render());
          return;
        }
        if (req.url === '/health' || req.url === '/') {
          const [database, redis] = await Promise.all([
            this.prisma.$queryRaw`SELECT 1`.then(
              () => 'up',
              () => 'down',
            ),
            this.redis.ping().then(
              (r) => (r === 'PONG' ? 'up' : 'down'),
              () => 'down',
            ),
          ]);
          const ok = database === 'up' && redis === 'up';
          res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ status: ok ? 'ok' : 'error', checks: { database, redis } }),
          );
          return;
        }
        res.writeHead(404).end();
      })().catch(() => {
        res.writeHead(500).end();
      });
    });
    this.server.listen(port, host, () =>
      this.logger.log(`Health/metrics sur ${host}:${port}`),
    );
  }

  onApplicationShutdown() {
    this.server?.close();
  }
}
