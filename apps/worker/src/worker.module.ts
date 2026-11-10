import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type IORedis from 'ioredis';
import { PrismaModule } from '@elitetime/database';
import { LdapSyncService } from 'api/ldap/ldap-sync.service';
import { ScheduledEmailService } from 'api/email/scheduled-email.service';
import { PointagesService } from 'api/pointages/pointages.service';
import { WorkTimeService } from 'api/work-time/work-time.service';
import { REDIS, RedisProviderModule } from './redis.provider';
import { SCHEDULED_QUEUE } from './queues';
import { LocksService } from './locks.service';
import { RealtimeService } from './realtime.service';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { ScheduledTasksProcessor } from './scheduled-tasks.processor';
import { ScheduleRegistrar } from './schedule-registrar.service';
import { WorkerMetrics } from './metrics.service';
import { HealthServer } from './health.server';

@Module({
  imports: [
    PrismaModule,
    RedisProviderModule,
    BullModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: IORedis) => ({
        connection: redis,
        // Isole les clés BullMQ par environnement si l'instance Redis est partagée
        prefix: `${process.env.REDIS_KEY_PREFIX ?? 'elitetime:'}bull`,
      }),
    }),
    BullModule.registerQueue({ name: SCHEDULED_QUEUE }),
  ],
  providers: [
    // Services métier réutilisés tels quels depuis l'API (dépendent de PrismaService seul)
    LdapSyncService,
    WorkTimeService,
    ScheduledEmailService,
    PointagesService,
    LocksService,
    RealtimeService,
    WorkerMetrics,
    ScheduledTasksService,
    ScheduledTasksProcessor,
    ScheduleRegistrar,
    HealthServer,
  ],
})
export class WorkerModule {}
