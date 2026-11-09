import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt } from '../lib/crypto';
import { encryptUser, decryptUser } from '../lib/prisma-crypto.helper';
import type {
  User,
  UserRole,
  UserStatus,
  Prisma,
} from '../generated/prisma/client';
import type { UserCreateInput } from '../generated/prisma/models';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitize(u: User) {
    const { password: _pw, ...safe } = decryptUser(u);
    return safe;
  }

  async getAll(params: {
    search?: string;
    role?: string;
    status?: string;
    hiddenFromLists?: string;
    department?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 1000;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    // Support multi-value: role=employee,team_lead
    if (params.role) {
      const roles = params.role
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      where.role =
        roles.length === 1
          ? (roles[0] as UserRole)
          : { in: roles as UserRole[] };
    }

    // Support multi-value: status=active,inactive
    if (params.status) {
      const statuses = params.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status =
        statuses.length === 1
          ? (statuses[0] as UserStatus)
          : { in: statuses as UserStatus[] };
    }

    // Filter hiddenFromLists (string 'true'/'false' from query param)
    if (params.hiddenFromLists !== undefined && params.hiddenFromLists !== '') {
      where.hiddenFromLists = params.hiddenFromLists === 'true';
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    let sanitized = users.map((u) => this.sanitize(u));

    // Filtre département en mémoire (champ chiffré — impossible en SQL)
    if (params.department) {
      sanitized = sanitized.filter((u) => u.department === params.department);
    }

    return {
      users: sanitized,
      total: params.department ? sanitized.length : total,
      page,
      limit,
    };
  }

  async getById(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Utilisateur introuvable');
    return this.sanitize(u);
  }

  async create(data: {
    username: string;
    email?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    password?: string;
    role?: string;
    department?: string | null;
    position?: string | null;
    isLocal?: boolean;
    status?: string;
    includeInReports?: boolean;
    hiddenFromLists?: boolean;
  }) {
    const normalized = data.username.toLowerCase().trim();

    const existing = await this.prisma.hiddenUsername.findUnique({
      where: { username: normalized },
    });
    if (existing)
      throw new ConflictException("Ce nom d'utilisateur existe déjà");

    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, SALT_ROUNDS)
      : null;
    const enc = encryptUser({
      email: data.email ?? null,
      username: normalized,
      firstname: data.firstname ?? null,
      lastname: data.lastname ?? null,
      department: data.department ?? null,
      position: data.position ?? null,
      isLocal: data.isLocal ?? false,
    });

    const user = await this.prisma.user.create({
      data: {
        username: enc.username!,
        email: enc.email,
        firstname: enc.firstname,
        lastname: enc.lastname,
        department: enc.department,
        position: enc.position,
        isLocal: data.isLocal ?? false,
        password: hashedPassword,
        role: (data.role as UserRole | undefined) ?? 'employee',
        status: (data.status as UserStatus | undefined) ?? 'active',
        includeInReports: data.includeInReports ?? true,
        hiddenFromLists: data.hiddenFromLists ?? false,
      },
    });

    await this.prisma.hiddenUsername.create({
      data: { username: normalized, userId: user.id, hidden: false },
    });

    return this.sanitize(user);
  }

  async update(
    id: string,
    data: Partial<{
      email: string | null;
      firstname: string | null;
      lastname: string | null;
      role: string;
      status: string;
      department: string | null;
      position: string | null;
      hiddenFromLists: boolean;
      includeInReports: boolean;
      teamLeadId: string | null;
    }>,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Utilisateur introuvable');

    const enc = encryptUser(data as unknown as Partial<UserCreateInput>);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.email !== undefined ? { email: enc.email } : {}),
        ...(data.firstname !== undefined ? { firstname: enc.firstname } : {}),
        ...(data.lastname !== undefined ? { lastname: enc.lastname } : {}),
        ...(data.department !== undefined
          ? { department: enc.department }
          : {}),
        ...(data.position !== undefined ? { position: enc.position } : {}),
        ...(data.role !== undefined ? { role: data.role as UserRole } : {}),
        ...(data.status !== undefined
          ? { status: data.status as UserStatus }
          : {}),
        ...(data.hiddenFromLists !== undefined
          ? { hiddenFromLists: data.hiddenFromLists }
          : {}),
        ...(data.includeInReports !== undefined
          ? { includeInReports: data.includeInReports }
          : {}),
        ...(data.teamLeadId !== undefined
          ? { teamLeadId: data.teamLeadId }
          : {}),
      },
    });

    return this.sanitize(updated);
  }

  async softDelete(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Utilisateur introuvable');

    const suffix = `__deleted__${id}`;
    const dec = decryptUser(u);

    await this.prisma.user.update({
      where: { id },
      data: {
        status: 'deleted',
        username: encrypt(`${dec.username}${suffix}`),
        email: dec.email ? encrypt(`${dec.email}${suffix}`) : null,
      },
    });
    return { success: true };
  }

  async toggleIncludeInReports(id: string, include: boolean) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { includeInReports: include },
    });
    return this.sanitize(updated);
  }

  async getProfile(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Utilisateur introuvable');
    return this.sanitize(u);
  }

  async updateProfile(
    id: string,
    data: { firstname?: string; lastname?: string },
  ) {
    const enc = encryptUser(data);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.firstname !== undefined ? { firstname: enc.firstname } : {}),
        ...(data.lastname !== undefined ? { lastname: enc.lastname } : {}),
      },
    });
    return this.sanitize(updated);
  }

  async changePassword(id: string, oldPassword: string, newPassword: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !u.password)
      throw new BadRequestException(
        'Compte non compatible avec le changement de mot de passe',
      );

    const isValid = await bcrypt.compare(oldPassword, u.password);
    if (!isValid)
      throw new BadRequestException('Mot de passe actuel incorrect');

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });
    return { success: true };
  }
}
