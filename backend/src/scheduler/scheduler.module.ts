import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { LdapModule } from '../ldap/ldap.module';
import { EmailModule } from '../email/email.module';
import { PointagesModule } from '../pointages/pointages.module';

@Module({
  imports: [WebsocketModule, LdapModule, EmailModule, PointagesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
