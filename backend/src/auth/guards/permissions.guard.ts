import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

/**
 * Permissions implicites par rôle — format module.action exclusivement.
 * Ces permissions sont appliquées sans entrée en base (performances).
 * Les permissions supplémentaires sont stockées dans UserPermission.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set(['*']),

  manager: new Set([
    // ── Dashboard ──
    'dashboard.view_team',
    // ── Pointages ──
    'pointages.view_self',
    'pointages.view_team',
    'pointages.view_all',
    'pointages.create',
    'pointages.edit',
    'pointages.delete',
    'pointages.close_session',
    'pointages.force_checkout',
    'pointages.validate',
    'pointages.export',
    // ── Pauses ──
    'breaks.view_self',
    'breaks.view_team',
    'breaks.view_all',
    'breaks.manage',
    'breaks.export',
    // ── Absences ──
    'absences.view_self',
    'absences.view_team',
    'absences.view_all',
    'absences.create',
    'absences.edit',
    'absences.delete',
    'absences.create_managed',
    'absences.edit_managed',
    'absences.delete_managed',
    'absences.approve',
    'absences.reject',
    'absences.export',
    'absences.view_history',
    // ── Corrections ──
    'corrections.view_self',
    'corrections.view_team',
    'corrections.view_all',
    'corrections.create',
    'corrections.approve',
    'corrections.reject',
    // ── Employés ──
    'employees.view_self',
    'employees.view_team',
    'employees.view_all',
    'employees.view_sensitive',
    'employees.create',
    'employees.edit',
    'employees.toggle_reports',
    'employees.activate',
    'employees.deactivate',
    'employees.reset_password',
    'employees.export',
    // ── Rapports ──
    'reports.view_self',
    'reports.view_team',
    'reports.view_all',
    'reports.generate',
    'reports.export_pdf',
    'reports.export_excel',
    'reports.schedule',
    'reports.delete_schedule',
    'reports.view_history',
    // ── Organisation ──
    'departments.view',
    'positions.view',
    // ── Logs ──
    'logs.view',
    'logs.export',
    'logs.view_auth',
    'logs.view_security',
    // ── Paramètres (lecture seule) ──
    'settings.view',
    // ── Emails ──
    'emails.view',
    'emails.configure',
    'emails.schedule',
    'emails.manage_recipients',
    'emails.send_now',
    'emails.delete_schedule',
    // ── LDAP ──
    'ldap.view',
    'ldap.sync',
    'ldap.view_users',
    'ldap.configure',
    // ── Permissions (lecture seule) ──
    'permissions.view',
    // ── IA ──
    'ai.chat',
    'ai.view_metrics',
    'ai.view_history',
    // ── Validations ──
    'validations.view_team',
    'validations.view_all',
    'validations.approve',
    'validations.reject',
    // ── Auth ──
    'auth.view_sessions',
    'auth.revoke_own_sessions',
    'auth.change_password',
    // ── Notifications ──
    'notifications.view',
    // ── Workers (lecture seule) ──
    'workers.view',
  ]),

  team_lead: new Set([
    // ── Dashboard ──
    'dashboard.view_team',
    // ── Pointages ──
    'pointages.view_self',
    'pointages.view_team',
    'pointages.create',
    'pointages.edit',
    'pointages.delete',
    'pointages.close_session',
    'pointages.export',
    // ── Pauses ──
    'breaks.view_self',
    'breaks.view_team',
    'breaks.manage',
    // ── Absences ──
    'absences.view_self',
    'absences.view_team',
    'absences.create',
    'absences.edit',
    'absences.delete',
    'absences.create_managed',
    'absences.edit_managed',
    'absences.delete_managed',
    'absences.approve',
    'absences.reject',
    'absences.export',
    // ── Corrections ──
    'corrections.view_self',
    'corrections.view_team',
    'corrections.create',
    'corrections.approve',
    'corrections.reject',
    // ── Employés (lecture équipe) ──
    'employees.view_self',
    'employees.view_team',
    // ── Rapports ──
    'reports.view_self',
    'reports.view_team',
    'reports.generate',
    'reports.export_pdf',
    'reports.export_excel',
    // ── Organisation ──
    'departments.view',
    'positions.view',
    // ── IA ──
    'ai.chat',
    // ── Validations ──
    'validations.view_team',
    'validations.approve',
    'validations.reject',
    // ── Auth ──
    'auth.view_sessions',
    'auth.revoke_own_sessions',
    'auth.change_password',
    // ── Notifications ──
    'notifications.view',
  ]),

  employee: new Set([]),
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) throw new ForbiddenException('Utilisateur non authentifié');
    if (user.role === 'admin') return true;

    const roleDefaults =
      ROLE_DEFAULT_PERMISSIONS[user.role] ?? new Set<string>();

    // Vérification rapide via les defaults du rôle (sans accès DB)
    if (required.every((p) => roleDefaults.has(p))) return true;

    // Vérification avec les permissions explicites en DB
    const userPermsDb = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      include: { permission: { select: { name: true } } },
    });
    const dbPermNames = new Set(userPermsDb.map((up) => up.permission.name));
    const allPerms = new Set<string>([...roleDefaults, ...dbPermNames]);

    if (!required.every((p) => allPerms.has(p))) {
      throw new ForbiddenException('Permissions insuffisantes');
    }

    return true;
  }
}
