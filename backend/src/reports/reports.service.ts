import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptUser,
  decryptPointage,
  decryptBreak,
} from '../lib/prisma-crypto.helper';
import { groupPointagesByDay } from '../lib/reports/report-service';
import { renderNewPointagesReportHtml } from '../lib/reports/new-pointages-report-template';
import { generateNewExcelReport } from '../lib/reports/new-excel-generator';
import { renderPdfFromHtml } from '../lib/reports/html-to-pdf';
import { ReportCalculator } from '../lib/reports/report-calculator';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/guards/permissions.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getThresholds() {
    const s = await this.prisma.systemSettings.findFirst({
      select: { workStartTime: true, workEndTime: true },
    });
    return {
      lateThreshold: s?.workStartTime ?? '08:45',
      overtimeThreshold: s?.workEndTime ?? '17:30',
    };
  }

  /**
   * Vérifie que le demandeur a le droit d'accéder aux données de l'employé cible.
   *
   * Règles :
   *  • Pas d'employeeId (rapport global) → autorisé si reports.view_all ou reports.view_team
   *  • employeeId === requesterId (ses propres données) → toujours autorisé
   *  • reports.view_all → peut accéder à tout employé
   *  • reports.view_team → uniquement les employés de son département
   *  • Sinon → ForbiddenException
   */
  async validateEmployeeAccess(
    requester: AuthenticatedUser,
    employeeId?: string,
  ): Promise<void> {
    // Rapport global (pas de cible précise) — scope vérifié par le PermissionsGuard
    if (!employeeId) return;

    // Accès à ses propres données — toujours autorisé
    if (employeeId === requester.id) return;

    // Construire le jeu de permissions effectif (defaults + DB explicites)
    const roleDefaults =
      ROLE_DEFAULT_PERMISSIONS[requester.role] ?? new Set<string>();
    const dbPerms = await this.prisma.userPermission.findMany({
      where: { userId: requester.id },
      include: { permission: { select: { name: true } } },
    });
    const allPerms = new Set<string>([
      ...roleDefaults,
      ...dbPerms.map((up) => up.permission.name),
    ]);

    // Accès global → peut voir n'importe quel employé
    if (allPerms.has('reports.view_all')) return;

    // Accès équipe → uniquement les employés du même département
    if (allPerms.has('reports.view_team')) {
      const target = await this.prisma.user.findUnique({
        where: { id: employeeId },
      });
      if (!target) throw new ForbiddenException('Employé introuvable');
      const targetDept = decryptUser(target).department ?? null;
      if (targetDept !== requester.department) {
        throw new ForbiddenException(
          "Accès refusé : cet employé n'appartient pas à votre département",
        );
      }
      return;
    }

    // Aucune permission suffisante pour accéder aux données d'un autre employé
    throw new ForbiddenException(
      'Permission insuffisante pour accéder aux données de cet employé',
    );
  }

  async generatePdf(params: {
    from: string;
    to: string;
    employeeId?: string;
    requester: AuthenticatedUser;
  }) {
    await this.validateEmployeeAccess(params.requester, params.employeeId);

    const [{ users, pointages, breaks }, thresholds] = await Promise.all([
      this.fetchData(params),
      this.getThresholds(),
    ]);
    if (users.length === 0) {
      throw new NotFoundException('Employé introuvable ou inactif');
    }
    const grouped = groupPointagesByDay(
      users,
      pointages,
      breaks,
      undefined,
      thresholds,
    );
    const days = grouped.map((day) => ({
      dateLabel: day.dateLabel,
      employees: day.employees.map((emp) => {
        const fmt = ReportCalculator.formatComputation(emp.computation);
        return {
          fullName: emp.fullName,
          position: emp.position,
          checkIn: emp.checkIn,
          checkOut: emp.checkOut,
          sessionCount: emp.sessionCount || 1,
          workDuration: fmt.workDuration,
          breakDuration: fmt.breakDuration,
          lateLabel: fmt.lateLabel,
          earlyExitLabel: fmt.earlyExitLabel,
          overtimeLabel: fmt.overtimeLabel,
          status: emp.status,
          lateReason: emp.lateReason,
          earlyExitReason: emp.earlyExitReason,
        };
      }),
    }));

    const periodLabel = `${new Date(params.from).toLocaleDateString('fr-FR')} – ${new Date(params.to).toLocaleDateString('fr-FR')}`;
    const html = renderNewPointagesReportHtml({
      periodLabel,
      generatedAtLabel: new Date().toLocaleString('fr-FR'),
      days: days,
    });
    return renderPdfFromHtml({ html });
  }

  async generateExcel(params: {
    from: string;
    to: string;
    employeeId?: string;
    requester: AuthenticatedUser;
  }) {
    await this.validateEmployeeAccess(params.requester, params.employeeId);

    const [{ users, pointages, breaks }, thresholds] = await Promise.all([
      this.fetchData(params),
      this.getThresholds(),
    ]);
    if (users.length === 0) {
      throw new NotFoundException('Employé introuvable ou inactif');
    }
    const grouped = groupPointagesByDay(
      users,
      pointages,
      breaks,
      undefined,
      thresholds,
    );
    const periodLabel = `${new Date(params.from).toLocaleDateString('fr-FR')} – ${new Date(params.to).toLocaleDateString('fr-FR')}`;
    return generateNewExcelReport(periodLabel, grouped);
  }

  async getTeamData(managerId: string, daysBack = 90) {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
    });
    if (!manager) return { users: [], pointages: [], breaks: [] };
    const dec = decryptUser(manager);
    const managerDept = dec.department ?? null;

    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    from.setHours(0, 0, 0, 0);

    const candidates = await this.prisma.user.findMany({
      where: {
        status: 'active',
        hiddenFromLists: false,
        includeInReports: true,
      },
    });

    const decTeam = candidates
      .map((u) => decryptUser(u))
      .filter((u) => !managerDept || u.department === managerDept);

    const ids = decTeam.map((u) => u.id);

    const [pointages, breaks] = await Promise.all([
      this.prisma.pointage.findMany({
        where: { userId: { in: ids }, date: { gte: from } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.break.findMany({
        where: { userId: { in: ids }, date: { gte: from } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      users: decTeam,
      pointages: pointages.map((p) => decryptPointage(p)),
      breaks: breaks.map((b) => decryptBreak(b)),
    };
  }

  private async fetchData(params: {
    from: string;
    to: string;
    employeeId?: string;
  }) {
    const from = new Date(params.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(params.to);
    to.setHours(23, 59, 59, 999);

    // Pour un rapport individuel (employeeId fourni), on retire les filtres
    // hiddenFromLists/includeInReports : un manager/admin doit pouvoir exporter
    // le rapport de tout employé actif, même hors des listes publiques.
    const userWhere = params.employeeId
      ? { status: 'active' as const, id: params.employeeId }
      : { status: 'active' as const, hiddenFromLists: false, includeInReports: true };

    const users = await this.prisma.user.findMany({ where: userWhere });
    const decUsers = users.map((u) => decryptUser(u));
    const ids = decUsers.map((u) => u.id);

    const [pointages, breaks] = await Promise.all([
      this.prisma.pointage.findMany({
        where: { userId: { in: ids }, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.break.findMany({
        where: { userId: { in: ids }, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      users: decUsers,
      pointages: pointages.map((p) => decryptPointage(p)),
      breaks: breaks.map((b) => decryptBreak(b)),
    };
  }
}
