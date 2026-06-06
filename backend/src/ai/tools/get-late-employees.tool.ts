import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptUser } from '../../lib/prisma-crypto.helper.js';
import { decrypt } from '../../lib/crypto.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetLateEmployeesArgs } from './tool-args.validator.js';

@Injectable()
export class GetLateEmployeesTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_late_employees',
      description:
        'Retourne la liste des employés en retard pour une date donnée. Réservé aux managers, team leads et admins.',
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
          "Vous n'avez pas les permissions pour voir les retards d'équipe.",
      };
    }

    // Validation stricte des arguments LLM avant tout accès Prisma
    const validation = validateGetLateEmployeesArgs(args);
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

      const latePointages = await this.prisma.pointage.findMany({
        where: { status: 'late', date: { gte: start, lte: end } },
        include: {
          user: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              username: true,
              department: true,
            },
          },
        },
        orderBy: { date: 'asc' },
      });

      const results = latePointages.map((p) => {
        const dec = decryptUser(p.user);
        const entryTime = p.entryTime ? decrypt(p.entryTime) : null;
        return {
          nom:
            `${dec.firstname || ''} ${dec.lastname || ''}`.trim() ||
            dec.username,
          département: dec.department ?? null,
          heureEntrée: entryTime,
        };
      });

      const filtered =
        context.role === 'team_lead' && context.department
          ? results.filter((r) => r.département === context.department)
          : results;

      return {
        success: true,
        data: {
          date: dateStr,
          nombreRetards: filtered.length,
          employés: filtered,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Erreur lors de la récupération des retards.',
      };
    }
  }
}
