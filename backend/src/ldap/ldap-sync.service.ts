import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'ldapts';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from '../lib/crypto';
import { encryptUser } from '../lib/prisma-crypto.helper';

export interface LdapSyncResult {
  syncedCount: number;
}

@Injectable()
export class LdapSyncService {
  private readonly logger = new Logger(LdapSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncEmployees(): Promise<LdapSyncResult> {
    const LDAP_URL = process.env.LDAP_URL;
    const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
    const LDAP_BIND_PWD = process.env.LDAP_PWD;
    const LDAP_BASE_DN = process.env.LDAP_BASE_DN;

    if (!LDAP_URL || !LDAP_BIND_DN || !LDAP_BIND_PWD || !LDAP_BASE_DN) {
      throw new Error(
        'Configuration LDAP manquante pour la synchronisation des employés.',
      );
    }

    const client = new Client({
      url: LDAP_URL,
      timeout: 10000,
      connectTimeout: 5000,
    });

    try {
      const hiddenRules = await this.prisma.hiddenUsername.findMany({
        where: { hidden: true },
        select: { username: true },
      });
      const hiddenUsernames = new Set(
        hiddenRules.map((r) => r.username.trim().toLowerCase()).filter(Boolean),
      );

      this.logger.log(
        "Démarrage de la synchronisation des employés depuis l'AD...",
      );
      await client.bind(LDAP_BIND_DN, LDAP_BIND_PWD);

      const { searchEntries } = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: '(&(objectClass=user)(!(sAMAccountName=*$)))',
        attributes: [
          'cn',
          'sAMAccountName',
          'mail',
          'givenName',
          'sn',
          'department',
          'title',
          'userAccountControl',
        ],
      });

      const users = searchEntries.filter((entry) => {
        const name = this.getLdapValue(
          (entry as Record<string, unknown>)['sAMAccountName'],
        );
        return (
          !!name &&
          this.isUtUsername(name) &&
          !['krbtgt', 'Administrateur', 'Invité'].includes(name)
        );
      });

      let syncedCount = 0;
      const ldapUsernames: string[] = [];

      this.logger.debug(`${users.length} entrées LDAP trouvées`);

      for (const entry of users) {
        const username = this.getLdapValue(
          (entry as Record<string, unknown>)['sAMAccountName'],
        );
        if (!username || !this.isUtUsername(username)) continue;

        ldapUsernames.push(username);

        const shouldBeHidden = hiddenUsernames.has(
          username.trim().toLowerCase(),
        );
        const ldapEmail = this.getLdapValue(
          (entry as Record<string, unknown>)['mail'],
        );
        const rawFirstname = this.getLdapValue(
          (entry as Record<string, unknown>)['givenName'],
        );
        const rawLastname = this.getLdapValue(
          (entry as Record<string, unknown>)['sn'],
        );
        const ldapCn = this.getLdapValue(
          (entry as Record<string, unknown>)['cn'],
        );

        let firstname = rawFirstname;
        let lastname = rawLastname;
        if ((!firstname || !lastname) && ldapCn) {
          const parts = ldapCn.split(/\s+/).filter(Boolean);
          if (!firstname && parts.length > 0) firstname = parts[0];
          if (!lastname && parts.length > 1)
            lastname = parts.slice(1).join(' ');
        }

        const department = this.getLdapValue(
          (entry as Record<string, unknown>)['department'],
        );
        const position = this.getLdapValue(
          (entry as Record<string, unknown>)['title'],
        );
        const rawUac = (entry as Record<string, unknown>)['userAccountControl'];
        const uacNumber =
          rawUac != null
            ? Number(Array.isArray(rawUac) ? rawUac[0] : rawUac)
            : NaN;
        const status: 'active' | 'inactive' =
          !Number.isNaN(uacNumber) && (uacNumber & 2) === 2
            ? 'inactive'
            : 'active';

        try {
          await this.safeUpsertUser(username, {
            email: ldapEmail,
            firstname,
            lastname,
            department,
            position,
            status,
            hiddenFromLists: shouldBeHidden,
          });
          syncedCount++;
        } catch (err) {
          this.logger.error(`Erreur upsert pour ${username}:`, err);
        }
      }

      if (hiddenUsernames.size > 0) {
        await this.prisma.user.updateMany({
          where: { username: { in: Array.from(hiddenUsernames) } },
          data: { hiddenFromLists: true },
        });
      }

      if (ldapUsernames.length > 0) {
        const usersToSoftDelete = await this.prisma.user.findMany({
          where: { role: 'employee', status: 'active', isLocal: false },
          select: { id: true, username: true },
        });

        for (const user of usersToSoftDelete) {
          try {
            const decryptedUsername = decrypt(user.username)
              .toLowerCase()
              .trim();
            if (
              !ldapUsernames
                .map((u) => u.toLowerCase().trim())
                .includes(decryptedUsername)
            ) {
              await this.prisma.user.update({
                where: { id: user.id },
                data: { status: 'deleted' },
              });
            }
          } catch (err) {
            this.logger.error(
              'Impossible de déchiffrer le username pour soft delete:',
              err,
            );
          }
        }
      }

      const activeAdUsers = await this.prisma.user.findMany({
        where: { status: 'active', isLocal: false },
        select: { id: true, username: true },
      });

      for (const user of activeAdUsers) {
        try {
          const decryptedUsername = decrypt(user.username).toLowerCase().trim();
          if (!this.isUtUsername(decryptedUsername)) {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { status: 'deleted' },
            });
          }
        } catch (err) {
          this.logger.error(
            'Impossible de déchiffrer le username pour filtrer UT:',
            err,
          );
        }
      }

      this.logger.log(
        `Synchronisation terminée, ${syncedCount} employé(s) traités`,
      );
      return { syncedCount };
    } catch (error) {
      this.logger.error(
        'Erreur lors de la synchronisation des employés:',
        error,
      );
      if (error instanceof Error) {
        throw new Error(
          `Échec de la synchronisation LDAP des employés : ${error.message}`,
        );
      }
      throw new Error(
        'Échec de la synchronisation LDAP des employés : erreur inconnue.',
      );
    } finally {
      try {
        await client.unbind();
      } catch (err) {
        this.logger.error('Erreur fermeture connexion LDAP:', err);
      }
    }
  }

  private isUtUsername(username: string): boolean {
    return username.trim().toLowerCase().startsWith('ut');
  }

  private getLdapValue(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length > 0) {
      const first: unknown = (value as unknown[])[0];
      if (typeof first === 'string') return first;
      if (Buffer.isBuffer(first)) return first.toString('utf8');
      if (typeof first === 'number' || typeof first === 'boolean')
        return String(first);
      return null;
    }
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return null;
  }

  private async loadHiddenUsernamesMap(): Promise<Map<string, string | null>> {
    const records = await this.prisma.hiddenUsername.findMany({
      select: { username: true, userId: true },
    });
    return new Map(
      records.map((r) => [r.username.toLowerCase().trim(), r.userId]),
    );
  }

  private async safeUpsertUser(
    username: string,
    data: {
      email: string | null;
      firstname: string | null;
      lastname: string | null;
      department: string | null;
      position: string | null;
      status: 'active' | 'inactive';
      hiddenFromLists: boolean;
    },
  ) {
    const normalizedUsername = username.toLowerCase().trim();

    const existingRecord = await this.prisma.hiddenUsername.findUnique({
      where: { username: normalizedUsername },
      include: { user: true },
    });

    if (existingRecord?.userId && existingRecord.user) {
      return existingRecord.user;
    }

    const encryptedUsername = encrypt(normalizedUsername);
    const encryptedData = encryptUser({
      email: data.email,
      username: normalizedUsername,
      firstname: data.firstname,
      lastname: data.lastname,
      department: data.department,
      position: data.position,
      isLocal: false,
    });

    const userByEncryptedUsername = await this.prisma.user.findUnique({
      where: { username: encryptedUsername },
    });

    if (userByEncryptedUsername) {
      const updatedUser = await this.prisma.user.update({
        where: { id: userByEncryptedUsername.id },
        data: {
          email: encryptedData.email,
          firstname: encryptedData.firstname,
          lastname: encryptedData.lastname,
          department: encryptedData.department,
          position: encryptedData.position,
          status: data.status,
          isLocal: false,
        },
      });

      await this.prisma.hiddenUsername.upsert({
        where: { username: normalizedUsername },
        update: { userId: updatedUser.id },
        create: {
          username: normalizedUsername,
          userId: updatedUser.id,
          hidden: data.hiddenFromLists,
        },
      });
      return updatedUser;
    }

    const newUser = await this.prisma.user.create({
      data: {
        username: encryptedUsername,
        email: encryptedData.email,
        firstname: encryptedData.firstname,
        lastname: encryptedData.lastname,
        department: encryptedData.department,
        position: encryptedData.position,
        isLocal: false,
        role: 'employee',
        status: data.status,
        hiddenFromLists: data.hiddenFromLists,
      },
    });

    await this.prisma.hiddenUsername.upsert({
      where: { username: normalizedUsername },
      update: { userId: newUser.id },
      create: {
        username: normalizedUsername,
        userId: newUser.id,
        hidden: data.hiddenFromLists,
      },
    });

    return newUser;
  }
}
