import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Client } from 'ldapts';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { encryptUser, decryptUser } from '../lib/prisma-crypto.helper';
import type { User } from '../generated/prisma/client';
import type { AuthenticatedUser } from './interfaces/authenticated-request.interface';

const SESSION_MAX_AGE_SECONDS = 86400; // 24h
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Rate limiting ─────────────────────────────────────────────────────────

  async checkRateLimit(key: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentFails = await this.prisma.activityLog.count({
      where: {
        action: 'LOGIN_ATTEMPT_FAILED',
        details: { contains: key },
        timestamp: { gte: windowStart },
        type: 'auth',
      },
    });
    return recentFails < RATE_LIMIT_MAX_ATTEMPTS;
  }

  async markLoginAttempt(username: string, success: boolean, ip: string) {
    if (!success) {
      await this.prisma.activityLog.create({
        data: {
          action: 'LOGIN_ATTEMPT_FAILED',
          details: `Failed login: ${username} from ${ip}`,
          timestamp: new Date(),
          type: 'auth',
        },
      });
    }
  }

  async logSecurityEvent(
    userId: string,
    event: string,
    details: string,
    ip: string,
  ) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: userId === 'system' ? null : userId,
          action: event,
          details: `${details} | IP: ${ip}`,
          timestamp: new Date(),
          type: 'auth',
        },
      });
    } catch {
      // Non-critique
    }
  }

  // ── Session management ────────────────────────────────────────────────────

  async createSession(userId: string, ip?: string, userAgent?: string) {
    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    await this.prisma.session.create({
      data: { userId, sessionToken, expiresAt, ipAddress: ip, userAgent },
    });

    return { sessionToken, expiresAt };
  }

  async deleteSession(sessionToken: string) {
    await this.prisma.session.deleteMany({ where: { sessionToken } });
  }

  async validateSession(sessionToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstname: true,
            lastname: true,
            role: true,
            department: true,
            position: true,
            status: true,
            isLocal: true,
            avatar: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) return null;
    if (session.user.status !== 'active') return null;

    return decryptUser(session.user);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(
    username: string,
    password: string,
    ip: string,
    userAgent: string,
  ) {
    const sanitized = username.toLowerCase().trim();

    // Rate limit
    const canAttempt = await this.checkRateLimit(`${ip}:${sanitized}`);
    if (!canAttempt) {
      await this.logSecurityEvent(
        'system',
        'LOGIN_RATE_LIMITED',
        `Rate limited: ${sanitized} from ${ip}`,
        ip,
      );
      throw new HttpException(
        'Trop de tentatives. Réessayez plus tard.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Lookup via HiddenUsername (non-chiffré)
    const hiddenRecord = await this.prisma.hiddenUsername.findUnique({
      where: { username: sanitized },
      include: { user: true },
    });

    // ── LOCAL ACCOUNT ──────────────────────────────────────────────────────
    if (hiddenRecord?.user?.isLocal && hiddenRecord.user.password) {
      return this.localLogin(
        sanitized,
        password,
        hiddenRecord.user,
        ip,
        userAgent,
      );
    }

    // ── LDAP ACCOUNT ───────────────────────────────────────────────────────
    return this.ldapLogin(username, password, ip, userAgent);
  }

  private async localLogin(
    username: string,
    password: string,
    user: User,
    ip: string,
    userAgent: string,
  ) {
    if (!user.password) {
      await this.markLoginAttempt(username, false, ip);
      throw new UnauthorizedException('Identifiants invalides');
    }
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      await this.markLoginAttempt(username, false, ip);
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.role !== 'admin' && user.role !== 'manager') {
      await this.logSecurityEvent(
        user.id,
        'LOGIN_DENIED_LOCAL_ROLE',
        `Local login denied for role ${user.role}`,
        ip,
      );
      throw new ForbiddenException(
        'Accès restreint aux administrateurs et managers',
      );
    }

    await this.markLoginAttempt(username, true, ip);
    const session = await this.createSession(user.id, ip, userAgent);

    await this.prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'Connexion Locale',
        details:
          `${user.firstname || ''} ${user.lastname || ''}`.trim() ||
          user.username,
        timestamp: new Date(),
        type: 'auth',
      },
    });

    await this.logSecurityEvent(
      user.id,
      'LOGIN_SUCCESS_LOCAL',
      `Local login for ${username}`,
      ip,
    );
    return { user: decryptUser(user), session };
  }

  private async ldapLogin(
    username: string,
    password: string,
    ip: string,
    userAgent: string,
  ) {
    const LDAP_URL = process.env.LDAP_URL;
    const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
    const LDAP_BIND_PWD = process.env.LDAP_PWD;
    const LDAP_BASE_DN = process.env.LDAP_BASE_DN;

    if (!LDAP_URL || !LDAP_BIND_DN || !LDAP_BIND_PWD || !LDAP_BASE_DN) {
      throw new ServiceUnavailableException(
        'Service temporairement indisponible',
      );
    }

    const client = new Client({
      url: LDAP_URL,
      timeout: 10000,
      connectTimeout: 5000,
    });

    try {
      await client.bind(LDAP_BIND_DN, LDAP_BIND_PWD);

      const escapedUsername = username
        .replace(/\\/g, '\\5c')
        .replace(/\*/g, '\\2a')
        .replace(/\(/g, '\\28')
        .replace(/\)/g, '\\29')
        .replace(/\0/g, '\\00')
        .replace(/\//g, '\\2f');

      const { searchEntries } = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: `(sAMAccountName=${escapedUsername})`,
        attributes: [
          'dn',
          'cn',
          'mail',
          'givenName',
          'sn',
          'department',
          'title',
        ],
        sizeLimit: 1,
      });

      if (searchEntries.length === 0) {
        await client.unbind();
        await this.markLoginAttempt(username, false, ip);
        throw new UnauthorizedException('Identifiants invalides');
      }

      const ldapEntry = searchEntries[0];
      const userClient = new Client({
        url: LDAP_URL,
        timeout: 10000,
        connectTimeout: 5000,
      });

      try {
        await userClient.bind(ldapEntry.dn, password);
      } catch {
        await userClient.unbind();
        await client.unbind();
        await this.markLoginAttempt(username, false, ip);
        throw new UnauthorizedException('Identifiants invalides');
      }

      await userClient.unbind();
      await client.unbind();
      await this.markLoginAttempt(username, true, ip);

      const getVal = (v: unknown): string | null => {
        if (!v) return null;
        if (typeof v === 'string') return v;
        if (Array.isArray(v) && v.length > 0) {
          const first: unknown = (v as unknown[])[0];
          if (typeof first === 'string') return first;
          if (Buffer.isBuffer(first)) return first.toString('utf8');
          if (typeof first === 'number' || typeof first === 'boolean')
            return String(first);
          return null;
        }
        if (Buffer.isBuffer(v)) return v.toString('utf8');
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        return null;
      };

      const e = ldapEntry as Record<string, unknown>;
      const ldapEmail = getVal(e.mail);
      let ldapFirstname = getVal(e.givenName);
      let ldapLastname = getVal(e.sn);
      const ldapCn = getVal(e.cn);

      if ((!ldapFirstname || !ldapLastname) && ldapCn) {
        const parts = ldapCn.split(/\s+/).filter(Boolean);
        if (!ldapFirstname && parts.length > 0) ldapFirstname = parts[0];
        if (!ldapLastname && parts.length > 1)
          ldapLastname = parts.slice(1).join(' ');
      }

      const appUser = await this.upsertLdapUser(username, {
        email: ldapEmail,
        firstname: ldapFirstname,
        lastname: ldapLastname,
        department: getVal(e.department),
        position: getVal(e.title),
      });

      if (!appUser) {
        throw new UnauthorizedException('Identifiants invalides');
      }

      const decryptedUser = decryptUser(appUser);
      const session = await this.createSession(decryptedUser.id, ip, userAgent);

      await this.prisma.activityLog.create({
        data: {
          userId: decryptedUser.id,
          action: 'Connexion',
          details:
            `${decryptedUser.firstname || ''} ${decryptedUser.lastname || ''}`.trim() ||
            decryptedUser.username,
          timestamp: new Date(),
          type: 'auth',
        },
      });

      await this.logSecurityEvent(
        decryptedUser.id,
        'LOGIN_SUCCESS',
        `LDAP login for ${username}`,
        ip,
      );
      return { user: decryptedUser, session };
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException ||
        err instanceof HttpException
      ) {
        throw err;
      }
      this.logger.error('LDAP login error:', err);
      throw new ServiceUnavailableException(
        'Service temporairement indisponible',
      );
    }
  }

  private async upsertLdapUser(
    username: string,
    data: {
      email: string | null;
      firstname: string | null;
      lastname: string | null;
      department: string | null;
      position: string | null;
    },
  ) {
    const normalizedUsername = username.toLowerCase().trim();

    const hiddenRecord = await this.prisma.hiddenUsername.findUnique({
      where: { username: normalizedUsername },
      select: { userId: true },
    });

    const encryptedData = encryptUser({
      email: data.email,
      username: normalizedUsername,
      firstname: data.firstname,
      lastname: data.lastname,
      department: data.department,
      position: data.position,
      isLocal: false,
    });

    const existingId = hiddenRecord?.userId;
    if (existingId) {
      return this.prisma.user.update({
        where: { id: existingId },
        data: {
          email: encryptedData.email,
          firstname: encryptedData.firstname,
          lastname: encryptedData.lastname,
          ...(data.department ? { department: encryptedData.department } : {}),
          ...(data.position ? { position: encryptedData.position } : {}),
          status: 'active',
        },
      });
    }

    const newUser = await this.prisma.user.create({
      data: {
        username: encryptedData.username!,
        email: encryptedData.email,
        firstname: encryptedData.firstname,
        lastname: encryptedData.lastname,
        department: encryptedData.department,
        position: encryptedData.position,
        isLocal: false,
        role: 'employee',
        status: 'active',
      },
    });

    await this.prisma.hiddenUsername.upsert({
      where: { username: normalizedUsername },
      update: { userId: newUser.id, hidden: false },
      create: {
        username: normalizedUsername,
        userId: newUser.id,
        hidden: false,
      },
    });

    return newUser;
  }

  // ── Permissions helpers ───────────────────────────────────────────────────

  async getUserPermissions(userId: string): Promise<string[]> {
    const perms = await this.prisma.userPermission.findMany({
      where: { userId },
      include: { permission: { select: { name: true } } },
    });
    return perms.map((p) => p.permission.name);
  }

  async getAllPermissionNames(): Promise<string[]> {
    const all = await this.prisma.permission.findMany({
      select: { name: true },
    });
    return all.map((p) => p.name);
  }

  sanitizeUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      role: user.role,
      department: user.department,
      position: user.position,
      status: user.status,
      isLocal: user.isLocal,
    };
  }
}
