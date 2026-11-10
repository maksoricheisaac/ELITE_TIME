import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elitetime/database';
import { aggregateDays, dayKeyOf, startOfWeek } from '@elitetime/time';
import { WorkTimeService } from '../../work-time/work-time.service';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetMyHoursArgs } from './tool-args.validator.js';

@Injectable()
export class GetMyHoursTool implements AiTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workTime: WorkTimeService,
  ) {}

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
              "Période : 'today' (aujourd'hui), 'week' (semaine en cours, du lundi à aujourd'hui), 'month' (mois en cours, du 1er à aujourd'hui).",
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
      // Mêmes fenêtres et mêmes règles que les tableaux de bord et les rapports (moteur commun).
      const today = dayKeyOf(new Date(), this.workTime.tz);
      const from =
        period === 'today'
          ? today
          : period === 'week'
            ? startOfWeek(today)
            : `${today.slice(0, 8)}01`;

      const days = await this.workTime.computeRange(
        context.userId,
        from,
        today,
        this.prisma,
      );
      const totals = aggregateDays(days);
      const totalMinutes = totals.netMinutes;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      return {
        success: true,
        data: {
          période: period,
          totalHeures: `${hours}h${minutes > 0 ? minutes + 'min' : ''}`,
          totalMinutes,
          nombreJoursTravaillés: days.filter((d) => d.grossMinutes > 0).length,
          nombreRetards: totals.lateDays,
          heuresSupplémentairesMinutes: totals.overtimeMinutes,
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
