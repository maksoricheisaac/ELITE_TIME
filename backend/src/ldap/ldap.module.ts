import { Module } from '@nestjs/common';
import { LdapController } from './ldap.controller';
import { LdapSyncService } from './ldap-sync.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LdapController],
  providers: [LdapSyncService],
  exports: [LdapSyncService],
})
export class LdapModule {}
