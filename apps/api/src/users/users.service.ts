import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@elitetime/database';
import { encrypt } from '@elitetime/shared';
import { encryptUser, decryptUser } from '@elitetime/shared';
import type { User, UserRole, UserStatus, Prisma } from '@elitetime/database';
import type { UserCreateInput } from '@elitetime/database/models';

const SALT_ROUNDS = 10;

const VALID_ROLES = ['employee', 'manager', 'admin', 'team_lead'] as const;
const VALID_STATUSES = ['active', 'inactive', 'deleted'] as const;

/** Rôles qu'un non-administrateur peut gérer (jamais admin ni manager). */
const NON_ADMIN_MANAGEABLE_ROLES = new Set(['employee', 'team_lead']);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Contrôle d'élévation de privilèges pour POST /users (côté serveur).
   * Seul un administrateur peut créer un compte admin/manager ; un
   * non-administrateur ne crée que des comptes `employee`.
   */
  assertCanCreate(
    actor: { id: string; role: string },
    data: { role?: string; status?: string },
  ) {
    if (data.role !== undefined && !VALID_ROLES.includes(data.role as never)) {
      throw new BadRequestException('Rôle invalide');
    }
    if (
      data.status !== undefined &&
      !VALID_STATUSES.includes(data.status as never)
    ) {
      throw new BadRequestException('Statut invalide');
    }
    if (actor.role === 'admin') return;
    if ((data.role ?? 'employee') !== 'employee') {
      throw new ForbiddenException(
        'Seul un administrateur peut attribuer ce rôle',
      );
    }
  }

  /**
   * Contrôle d'élévation de privilèges pour PATCH /users/:id.
   *  - nul ne modifie son propre rôle ni son propre statut ;
   *  - seul un administrateur modifie un rôle, ou un compte admin/manager ;
   *  - un non-administrateur ne peut qu'activer/désactiver un employé/team lead.
   */
  async assertCanUpdate(
    actor: { id: string; role: string },
    targetId: string,
    data: { role?: string; status?: string },
  ) {
    if (data.role !== undefined && !VALID_ROLES.includes(data.role as never)) {
      throw new BadRequestException('Rôle invalide');
    }
    if (
      data.status !== undefined &&
      !VALID_STATUSES.includes(data.status as never)
    ) {
      throw new BadRequestException('Statut invalide');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    const touchesRoleOrStatus =
      data.role !== undefined || data.status !== undefined;

    if (actor.id === targetId && touchesRoleOrStatus) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre rôle ou statut',
      );
    }
    if (actor.role === 'admin') return;

    if (!NON_ADMIN_MANAGEABLE_ROLES.has(target.role)) {
      throw new ForbiddenException(
        'Seul un administrateur peut modifier ce compte',
      );
    }
    if (data.role !== undefined) {
      throw new ForbiddenException(
        'Seul un administrateur peut modifier un rôle',
      );
    }
    if (
      data.status !== undefined &&
      data.status !== 'active' &&
      data.status !== 'inactive'
    ) {
      throw new ForbiddenException(
        'Seul un administrateur peut appliquer ce statut',
      );
    }
  }

  /** Nul ne se supprime lui-même ; seul un admin supprime un compte admin/manager. */
  async assertCanDelete(actor: { id: string; role: string }, targetId: string) {
    if (actor.id === targetId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas supprimer votre propre compte',
      );
    }
    if (actor.role === 'admin') return;
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (target && !NON_ADMIN_MANAGEABLE_ROLES.has(target.role)) {
      throw new ForbiddenException(
        'Seul un administrateur peut supprimer ce compte',
      );
    }
  }

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
