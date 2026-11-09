import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decrypt } from '../../lib/crypto.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetMyPointageHistoryArgs } from './tool-args.validator.js';

const STATUS_LABELS: Record<string, string> = {
  present: 'Présent',
  late: 'Retard',
  absent: 'Absent',
  early_leave: 'Départ anticipé',
};

@Injectable()
export class GetMyPointageHistoryTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_my_pointage_history',
      description:
        "Retourne le détail jour par jour des pointages de l'utilisateur connecté (entrée, sortie, durée, statut) sur une période donnée.",
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description:
              "Période : 'today' (aujourd'hui), 'week' (7 derniers jours), 'month' (30 derniers jours).",
            enum: ['today', 'week', 'month'],
          },
        },
      },
    },
  };

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<AiToolResult> {
    const validation = validateGetMyPointageHistoryArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const period = (validation.sanitized.period as string) || 'week';
      const now = new Date();
      let from: Date;

      if (period === 'today') {
        from = new Date(now);
        from.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        from = new Date(now);
        from.setDate(now.getDate() - 7);
      } else {
        from = new Date(now);
        from.setDate(now.getDate() - 30);
      }

      const rows = await this.prisma.pointage.findMany({
        where: { userId: context.userId, date: { gte: from, lte: now } },
        select: {
          date: true,
          entryTime: true,
          exitTime: true,
          duration: true,
          status: true,
          lateReason: true,
          earlyExitReason: true,
        },
        orderBy: { date: 'desc' },
        take: 31,
      });

      const jours = rows.map((p) => ({
        date: p.date.toISOString().slice(0, 10),
        heureEntrée: p.entryTime ? decrypt(p.entryTime) : null,
        heureSortie: p.exitTime ? decrypt(p.exitTime) : null,
        durée: `${Math.floor(p.duration / 60)}h${p.duration % 60}min`,
        statut: STATUS_LABELS[p.status] ?? p.status,
        motifRetard: p.lateReason ?? null,
        motifDépartAnticipé: p.earlyExitReason ?? null,
      }));

      return {
        success: true,
        data: {
          période: period,
          nombreJours: jours.length,
          jours,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Erreur lors de la récupération de l’historique des pointages.',
      };
    }
  }
}
