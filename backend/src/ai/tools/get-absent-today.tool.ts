import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptUser } from '../../lib/prisma-crypto.helper.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetAbsentTodayArgs } from './tool-args.validator.js';

@Injectable()
export class GetAbsentTodayTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_absent_today',
      description:
        "Retourne la liste des employés absents aujourd'hui (non pointés). Réservé aux managers, team leads et admins.",
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            description: 'Filtrer par département (optionnel).',
          },
        },
      },
    },
  };

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<AiToolResult> {
    // RBAC — vérifié aussi par l'orchestrateur, double-check défensif ici
    if (context.role === 'employee') {
      return {
        success: false,
        error:
          "Vous n'avez pas les permissions pour voir les absences d'équipe.",
      };
    }

    // Validation stricte des arguments LLM avant tout accès Prisma
    const validation = validateGetAbsentTodayArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [activeUsers, todayPointages, approvedLeaves] = await Promise.all([
        this.prisma.user.findMany({
          where: { status: 'active', role: { in: ['employee', 'team_lead'] } },
          select: {
            id: true,
            firstname: true,
            lastname: true,
            username: true,
            department: true,
          },
          take: 500,
        }),
        this.prisma.pointage.findMany({
          where: { date: { gte: todayStart, lte: todayEnd } },
          select: { userId: true },
          take: 500,
        }),
        this.prisma.absence.findMany({
          where: {
            status: 'approved',
            startDate: { lte: todayEnd },
            endDate: { gte: todayStart },
          },
          select: { userId: true },
          take: 500,
        }),
      ]);

      const pointedUserIds = new Set(todayPointages.map((p) => p.userId));
      const onLeaveUserIds = new Set(approvedLeaves.map((a) => a.userId));
      const deptFilter = validation.sanitized.department as string | undefined;

      const absent = activeUsers
        .filter((u) => !pointedUserIds.has(u.id))
        .map((u) => {
          const dec = decryptUser(u);
          return {
            nom:
              `${dec.firstname || ''} ${dec.lastname || ''}`.trim() ||
              dec.username,
            département: dec.department ?? null,
            motif: onLeaveUserIds.has(u.id)
              ? 'En congé approuvé'
              : 'Non pointé',
          };
        });

      const filtered =
        context.role === 'team_lead' && context.department
          ? absent.filter((u) => u.département === context.department)
          : deptFilter
            ? absent.filter((u) =>
                u.département?.toLowerCase().includes(deptFilter.toLowerCase()),
              )
            : absent;

      return {
        success: true,
        data: {
          date: todayStart.toISOString().slice(0, 10),
          nombreAbsents: filtered.length,
          absents: filtered,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Erreur lors de la récupération des absences.',
      };
    }
  }
}
