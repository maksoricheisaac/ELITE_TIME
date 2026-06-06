import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptUser } from '../lib/prisma-crypto.helper';
import { decrypt } from '../lib/crypto';

// Extrait "YYYY-MM-DD" depuis les getters locaux du process Node.js.
// Contrairement à .toISOString() qui retourne toujours UTC, cette fonction
// respecte le fuseau horaire système — indispensable pour rattacher les
// pointages du soir au bon jour calendaire (ex. 23h30 CEST = 21h30 UTC = J en
// local, mais J-1 via toISOString).
function toLocalDateKey(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`
  );
}

// Déchiffre le département d'un utilisateur brut (champ encrypted) et retourne
// le nom en clair, ou null si absent/impossible à déchiffrer.
function decryptDept(encryptedDept: string | null | undefined): string | null {
  if (!encryptedDept) return null;
  try {
    return decrypt(encryptedDept);
  } catch {
    return encryptedDept; // fallback : valeur brute si non chiffrée
  }
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin stats — shape attendue par AdminDashboardStats ──────────────────

  async getAdminStats() {
    const [users, departments, todayPointages] = await Promise.all([
      this.prisma.user.findMany({
        where: { status: { not: 'deleted' } },
        select: { id: true, role: true, status: true, department: true },
      }),
      this.prisma.department.findMany({ select: { name: true } }),
      this.prisma.pointage.findMany({
        where: {
          isActive: true,
          date: { gte: this.todayStart(), lte: this.todayEnd() },
        },
        select: { userId: true },
      }),
    ]);

    const activeUsers = users.filter((u) => u.status === 'active');
    const deptCountMap = new Map<string, number>();
    for (const u of activeUsers) {
      const name = decryptDept(u.department);
      if (name) deptCountMap.set(name, (deptCountMap.get(name) ?? 0) + 1);
    }

    const deptStats = departments.map((d) => ({
      name: d.name,
      count: deptCountMap.get(d.name) ?? 0,
    }));

    return {
      totalUsers: users.length,
      employees: users.filter((u) => u.role === 'employee').length,
      managers: users.filter((u) => u.role === 'manager').length,
      admins: users.filter((u) => u.role === 'admin').length,
      activeToday: new Set(todayPointages.map((p) => p.userId)).size,
      departments: deptStats,
    };
  }

  // ── Admin chart — format { presence[], retards[] } ────────────────────────

  async getAdminChartData(from: Date, to: Date) {
    const totalActive = await this.prisma.user.count({
      where: { status: 'active', role: { in: ['employee', 'team_lead'] } },
    });
    const pointages = await this.prisma.pointage.findMany({
      where: {
        date: { gte: new Date(from), lte: new Date(to) },
        // On exclut les utilisateurs supprimés au niveau du graphe admin via
        // la jointure implicite — on garde tous les pointages existants.
      },
      select: { date: true, status: true, userId: true },
    });

    const byDay: Record<string, { userIds: Set<string>; late: number }> = {};
    for (const p of pointages) {
      // Utilise les getters locaux — pas toISOString() qui est UTC et peut
      // décaler le jour d'un calendaire sur les pointages tardifs (>22h CEST).
      const key = toLocalDateKey(p.date);
      if (!byDay[key]) byDay[key] = { userIds: new Set(), late: 0 };
      byDay[key].userIds.add(p.userId);
      if (p.status === 'late') byDay[key].late++;
    }

    const sorted = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));

    return {
      presence: sorted.map(([date, v]) => ({
        date,
        presents: v.userIds.size,
        absents: Math.max(0, totalActive - v.userIds.size),
        total: totalActive,
      })),
      retards: sorted.map(([date, v]) => ({
        date,
        retards: v.late,
        moyenneRetard:
          v.userIds.size > 0 ? Math.round((v.late / v.userIds.size) * 100) : 0,
      })),
    };
  }

  // ── Manager stats ─────────────────────────────────────────────────────────

  async getManagerStats(managerId: string) {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
    });
    if (!manager) return null;
    const dec = decryptUser(manager);
    const managerDept = dec.department ?? null;

    // Le département est chiffré en base : impossible de filtrer en Prisma.
    // On charge tous les actifs, on déchiffre en mémoire, on filtre par
    // département du manager. Si le manager n'a pas de département, on retourne
    // tous les actifs (comportement par défaut pour admin/manager global).
    const allActive = await this.prisma.user.findMany({
      where: { status: 'active' },
      select: { id: true, role: true, department: true },
    });

    const teamMembers = allActive.filter((u) => {
      if (!managerDept) return true;
      return decryptDept(u.department) === managerDept;
    });

    const teamIds = teamMembers.map((u) => u.id);

    const [departments, todayPointages] = await Promise.all([
      this.prisma.department.findMany({ select: { name: true } }),
      this.prisma.pointage.findMany({
        where: {
          userId: { in: teamIds },
          isActive: true,
          date: { gte: this.todayStart(), lte: this.todayEnd() },
        },
        select: { userId: true },
      }),
    ]);

    const deptCountMap = new Map<string, number>();
    for (const u of teamMembers) {
      const name = decryptDept(u.department);
      if (name) deptCountMap.set(name, (deptCountMap.get(name) ?? 0) + 1);
    }

    const deptStats = departments.map((d) => ({
      name: d.name,
      count: deptCountMap.get(d.name) ?? 0,
    }));

    return {
      totalUsers: teamMembers.length,
      employees: teamMembers.filter((u) => u.role === 'employee').length,
      managers: teamMembers.filter((u) => u.role === 'manager').length,
      admins: teamMembers.filter((u) => u.role === 'admin').length,
      activeToday: new Set(todayPointages.map((p) => p.userId)).size,
      departments: deptStats,
    };
  }

  async getManagerChartData(managerId: string, from: Date, to: Date) {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
    });
    if (!manager) return { presence: [], retards: [] };
    const dec = decryptUser(manager);
    const managerDept = dec.department ?? null;

    // Même logique que getManagerStats : département chiffré → filtre en mémoire.
    const allActive = await this.prisma.user.findMany({
      where: { status: 'active' },
      select: { id: true, department: true },
    });

    const team = allActive.filter((u) => {
      if (!managerDept) return true;
      return decryptDept(u.department) === managerDept;
    });

    if (team.length === 0) return { presence: [], retards: [] };

    const pointages = await this.prisma.pointage.findMany({
      where: {
        userId: { in: team.map((u) => u.id) },
        date: { gte: new Date(from), lte: new Date(to) },
      },
      select: { date: true, status: true, userId: true },
    });

    const byDay: Record<string, { userIds: Set<string>; late: number }> = {};
    for (const p of pointages) {
      const key = toLocalDateKey(p.date);
      if (!byDay[key]) byDay[key] = { userIds: new Set(), late: 0 };
      byDay[key].userIds.add(p.userId);
      if (p.status === 'late') byDay[key].late++;
    }

    const sorted = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));

    return {
      presence: sorted.map(([date, v]) => ({
        date,
        presents: v.userIds.size,
        absents: Math.max(0, team.length - v.userIds.size),
        total: team.length,
      })),
      retards: sorted.map(([date, v]) => ({
        date,
        retards: v.late,
        moyenneRetard:
          v.userIds.size > 0 ? Math.round((v.late / v.userIds.size) * 100) : 0,
      })),
    };
  }

  private todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private todayEnd() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
