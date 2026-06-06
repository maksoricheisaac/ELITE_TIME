import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
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
  providers: [AppService],
})
export class AppModule {}
