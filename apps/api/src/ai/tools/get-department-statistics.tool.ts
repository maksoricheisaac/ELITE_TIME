import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decrypt } from '../../lib/crypto.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetDepartmentStatisticsArgs } from './tool-args.validator.js';

@Injectable()
export class GetDepartmentStatisticsTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_department_statistics',
      description:
        'Statistiques RH par département : effectif, nombre de présents, retards du jour. Réservé aux managers et admins.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  };

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<AiToolResult> {
    // RBAC — vérifié aussi par l'orchestrateur, double-check défensif ici
    if (context.role === 'employee' || context.role === 'team_lead') {
      return {
        success: false,
        error:
          "Vous n'avez pas les permissions pour voir les statistiques par département.",
      };
    }

    // Validation (aucun arg attendu pour cet outil)
    const validation = validateGetDepartmentStatisticsArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [departments, users, todayPointages] = await Promise.all([
        this.prisma.department.findMany({ select: { name: true }, take: 100 }),
        this.prisma.user.findMany({
          where: { status: 'active' },
          select: { id: true, department: true },
          take: 500,
        }),
        this.prisma.pointage.findMany({
          where: { date: { gte: todayStart, lte: todayEnd } },
          select: { userId: true, status: true },
          take: 500,
        }),
      ]);

      const pointedMap = new Map(todayPointages.map((p) => [p.userId, p]));

      const stats = departments.map((dept) => {
        const deptUsers = users.filter((u) => {
          if (!u.department) return false;
          try {
            return decrypt(u.department) === dept.name;
          } catch {
            return u.department === dept.name;
          }
        });

        const presents = deptUsers.filter((u) => pointedMap.has(u.id)).length;
        const retards = deptUsers.filter(
          (u) => pointedMap.get(u.id)?.status === 'late',
        ).length;

        return {
          département: dept.name,
          effectif: deptUsers.length,
          présentsAujourdhui: presents,
          absentsAujourdhui: deptUsers.length - presents,
          retardsAujourdhui: retards,
        };
      });

      return {
        success: true,
        data: {
          date: todayStart.toISOString().slice(0, 10),
          statistiquesParDépartement: stats,
        },
      };
    } catch {
      return {
        success: false,
        error:
          'Erreur lors de la récupération des statistiques par département.',
      };
    }
  }
}
