import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetMyHoursArgs } from './tool-args.validator.js';

@Injectable()
export class GetMyHoursTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_my_hours',
      description:
        "Retourne le total d'heures travaillées par l'utilisateur connecté pour une période donnée.",
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
        required: ['period'],
      },
    },
  };

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<AiToolResult> {
    // Validation stricte des arguments LLM avant tout accès Prisma
    const validation = validateGetMyHoursArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const period = validation.sanitized.period as string;
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
        select: { duration: true, status: true, date: true },
      });

      const totalMinutes = rows.reduce((s, p) => s + p.duration, 0);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const lates = rows.filter((p) => p.status === 'late').length;

      return {
        success: true,
        data: {
          période: period,
          totalHeures: `${hours}h${minutes > 0 ? minutes + 'min' : ''}`,
          totalMinutes,
          nombreJoursTravaillés: rows.length,
          nombreRetards: lates,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Erreur lors de la récupération des heures.',
      };
    }
  }
}
