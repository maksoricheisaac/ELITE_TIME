import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { SCHEDULED_QUEUE, SCHEDULES } from './queues';

/**
 * Enregistre (de façon idempotente) les planifications dans Redis au démarrage.
 * upsertJobScheduler met à jour une planification existante au lieu d'en créer
 * une seconde : plusieurs instances du worker partagent donc les mêmes.
 */
@Injectable()
export class ScheduleRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduleRegistrar.name);

  constructor(@InjectQueue(SCHEDULED_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    const tz = process.env.TZ || undefined;
    for (const s of SCHEDULES) {
      await this.queue.upsertJobScheduler(
        s.id,
        { ...s.repeat, ...('pattern' in s.repeat && tz ? { tz } : {}) },
        {
          name: s.id,
          opts: {
            attempts: s.attempts,
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 200 },
          },
        },
      );
    }
    this.logger.log(
      `${SCHEDULES.length} planifications enregistrées (fuseau : ${tz ?? 'système'})`,
    );
  }
}
