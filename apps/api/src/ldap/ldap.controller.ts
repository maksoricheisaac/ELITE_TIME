import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { LdapSyncService } from './ldap-sync.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Client } from 'ldapts';

@Controller('ldap')
@UseGuards(AuthGuard, PermissionsGuard)
export class LdapController {
  private readonly logger = new Logger(LdapController.name);

  constructor(private readonly ldapSync: LdapSyncService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ldap.sync')
  async sync() {
    this.logger.log('Synchronisation LDAP manuelle déclenchée');
    const result = await this.ldapSync.syncEmployees();
    return { success: true, syncedCount: result.syncedCount };
  }

  @Get('users')
  @RequirePermissions('ldap.view_users')
  async getUsers() {
    const LDAP_URL = process.env.LDAP_URL;
    const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
    const LDAP_BIND_PWD = process.env.LDAP_PWD;
    const LDAP_BASE_DN = process.env.LDAP_BASE_DN;

    if (!LDAP_URL || !LDAP_BIND_DN || !LDAP_BIND_PWD || !LDAP_BASE_DN) {
      return { users: [], error: 'Configuration LDAP manquante' };
    }

    const client = new Client({
      url: LDAP_URL,
      timeout: 10000,
      connectTimeout: 5000,
    });
    try {
      await client.bind(LDAP_BIND_DN, LDAP_BIND_PWD);
      const { searchEntries } = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: '(&(objectClass=user)(!(sAMAccountName=*$)))',
        attributes: ['sAMAccountName', 'cn', 'mail', 'userAccountControl'],
      });

      const users = searchEntries
        .map((e) => {
          const entry = e as Record<string, unknown>;
          const rawName: unknown = Array.isArray(entry.sAMAccountName)
            ? (entry.sAMAccountName as unknown[])[0]
            : entry.sAMAccountName;
          const username = typeof rawName === 'string' ? rawName : '';
          const rawUac = entry.userAccountControl;
          const uacRaw: unknown = Array.isArray(rawUac)
            ? (rawUac as unknown[])[0]
            : rawUac;
          const uac = rawUac != null ? Number(uacRaw) : NaN;
          const disabled = !Number.isNaN(uac) && (uac & 2) === 2;
          return { username, disabled };
        })
        .filter(
          (u) =>
            u.username &&
            !['krbtgt', 'Administrateur', 'Invité'].includes(u.username),
        );

      return { users };
    } finally {
      await client.unbind().catch(() => {});
    }
  }
}
