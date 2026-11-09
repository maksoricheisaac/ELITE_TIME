import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { RedisThrottlerStorage } from './redis/throttler-redis.storage';
import { AppThrottlerGuard, isLoginRequest } from './redis/app-throttler.guard';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@elitetime/database';
import { AuthModule } from './auth/auth.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { PointagesModule } from './pointages/pointages.module';
import { BreaksModule } from './breaks/breaks.module';
import { AbsencesModule } from './absences/absences.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { PositionsModule } from './positions/positions.module';
import { SettingsModule } from './settings/settings.module';
import { PermissionsModule } from './permissions/permissions.module';
import { LogsModule } from './logs/logs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { EmailSchedulingModule } from './email-scheduling/email-scheduling.module';
import { SeedModule } from './seed/seed.module';
import { LdapModule } from './ldap/ldap.module';
import { EmailModule } from './email/email.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        // Compteurs partagés via Redis (repli mémoire locale si indisponible)
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: Number(process.env.THROTTLE_LIMIT ?? 600),
            skipIf: (ctx) => isLoginRequest(ctx.switchToHttp().getRequest()),
          },
          {
            // Anti brute-force : tentatives de connexion par IP + identifiant
            name: 'login',
            ttl: 5 * 60_000,
            limit: Number(process.env.THROTTLE_LOGIN_LIMIT ?? 10),
            blockDuration: 5 * 60_000,
            skipIf: (ctx) => !isLoginRequest(ctx.switchToHttp().getRequest()),
          },
        ],
      }),
    }),
    HealthModule,
    PrismaModule,
    AuthModule,
    WebsocketModule,
    LdapModule,
    EmailModule,
    SchedulerModule,
    PointagesModule,
    BreaksModule,
    AbsencesModule,
    UsersModule,
    DepartmentsModule,
    PositionsModule,
    SettingsModule,
    PermissionsModule,
    LogsModule,
    DashboardModule,
    ReportsModule,
    EmailSchedulingModule,
    // SeedModule désactivé en production — endpoints de seeding non exposés en prod
    ...(process.env.NODE_ENV !== 'production' ? [SeedModule] : []),
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
