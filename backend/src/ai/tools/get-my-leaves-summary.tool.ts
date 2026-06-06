import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetMyLeavesSummaryArgs } from './tool-args.validator.js';

@Injectable()
export class GetMyLeavesSummaryTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_my_leaves_summary',
      description:
        "Résumé des congés et absences de l'utilisateur connecté pour l'année en cours (ou une année donnée).",
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description:
              "Année à consulter (ex: '2025'). Utilise l'année courante par défaut.",
          },
        },
      },
    },
  };

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<AiToolResult> {
    // Validation stricte des arguments LLM avant tout accès Prisma
    const validation = validateGetMyLeavesSummaryArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const yearStr =
        (validation.sanitized.year as string) ||
        String(new Date().getFullYear());
      const year = parseInt(yearStr, 10);

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

      const absences = await this.prisma.absence.findMany({
        where: {
          userId: context.userId,
          startDate: { gte: yearStart, lte: yearEnd },
        },
        orderBy: { startDate: 'desc' },
      });

      let joursCongesApprouvés = 0;
      const byStatus = { pending: 0, approved: 0, rejected: 0 };
      const byType = { conge: 0, maladie: 0, autre: 0 };

      for (const a of absences) {
        byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
        byType[a.type] = (byType[a.type] ?? 0) + 1;
        if (a.status === 'approved' && a.type === 'conge') {
          const days =
            Math.ceil(
              (a.endDate.getTime() - a.startDate.getTime()) / 86_400_000,
            ) + 1;
          joursCongesApprouvés += days;
        }
      }

      return {
        success: true,
        data: {
          année: year,
          totalDemandes: absences.length,
          enAttente: byStatus.pending,
          approuvées: byStatus.approved,
          refusées: byStatus.rejected,
          joursCongesPayésApprouvés: joursCongesApprouvés,
          répartitionParType: {
            congéPayé: byType.conge,
            maladie: byType.maladie,
            autre: byType.autre,
          },
        },
      };
    } catch {
      return {
        success: false,
        error: 'Erreur lors de la récupération du résumé des congés.',
      };
    }
  }
}
