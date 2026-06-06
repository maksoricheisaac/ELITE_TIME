import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptUser } from '../../lib/prisma-crypto.helper.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetTeamAttendanceArgs } from './tool-args.validator.js';

@Injectable()
export class GetTeamAttendanceTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_team_attendance',
      description:
        "Résumé des présences de l'équipe pour une date donnée (présents, absents, retards). Réservé aux managers, team leads et admins.",
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: "Date au format YYYY-MM-DD (aujourd'hui par défaut).",
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
          "Vous n'avez pas les permissions pour voir les présences d'équipe.",
      };
    }

    // Validation stricte des arguments LLM avant tout accès Prisma
    const validation = validateGetTeamAttendanceArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const dateStr =
        (validation.sanitized.date as string) ||
        new Date().toISOString().slice(0, 10);
      const date = new Date(dateStr);
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const [activeUsers, pointages] = await Promise.all([
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
          where: { date: { gte: start, lte: end } },
          select: { userId: true, status: true, duration: true },
          take: 500,
        }),
      ]);

      const pointedMap = new Map(pointages.map((p) => [p.userId, p]));

      const allResults = activeUsers.map((u) => {
        const dec = decryptUser(u);
        const p = pointedMap.get(u.id);
        const statusLabel = p
          ? p.status === 'late'
            ? 'Présent (retard)'
            : 'Présent'
          : 'Absent';
        return {
          nom:
            `${dec.firstname || ''} ${dec.lastname || ''}`.trim() ||
            dec.username,
          département: dec.department ?? null,
          statut: statusLabel,
          heuresTravaillées: p
            ? `${Math.floor(p.duration / 60)}h${p.duration % 60}min`
            : '-',
        };
      });

      const filtered =
        context.role === 'team_lead' && context.department
          ? allResults.filter((r) => r.département === context.department)
          : allResults;

      const presents = filtered.filter((r) => r.statut !== 'Absent').length;
      const retards = filtered.filter(
        (r) => r.statut === 'Présent (retard)',
      ).length;

      return {
        success: true,
        data: {
          date: dateStr,
          totalEmployés: filtered.length,
          présents: presents,
          absents: filtered.length - presents,
          retards,
          tauxPrésence:
            filtered.length > 0
              ? `${Math.round((presents / filtered.length) * 100)}%`
              : '0%',
          détail: filtered,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Erreur lors de la récupération des présences.',
      };
    }
  }
}
