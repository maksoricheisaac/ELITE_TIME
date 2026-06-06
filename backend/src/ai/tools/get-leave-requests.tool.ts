import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptUser } from '../../lib/prisma-crypto.helper.js';
import { decrypt } from '../../lib/crypto.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateGetLeaveRequestsArgs } from './tool-args.validator.js';

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
};

const TYPE_LABELS: Record<string, string> = {
  conge: 'Congé payé',
  maladie: 'Maladie',
  autre: 'Autre',
};

@Injectable()
export class GetLeaveRequestsTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'get_leave_requests',
      description:
        "Retourne les demandes d'absence/congé. L'employé ne voit que les siennes, le manager/admin voit toute l'équipe.",
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description:
              "Filtrer par statut : 'pending' (en attente), 'approved' (approuvé), 'rejected' (refusé).",
            enum: ['pending', 'approved', 'rejected'],
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
    const validation = validateGetLeaveRequestsArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const statusFilter = validation.sanitized.status as string | undefined;
      const whereBase: Record<string, unknown> = {};
      if (statusFilter) whereBase.status = statusFilter;

      if (context.role === 'employee') {
        whereBase.userId = context.userId;
      } else if (context.role === 'team_lead' && context.department) {
        const allUsers = await this.prisma.user.findMany({
          where: { status: 'active' },
          select: { id: true, department: true },
        });
        const teamUserIds = allUsers
          .filter((u) => {
            if (!u.department) return false;
            try {
              return decrypt(u.department) === context.department;
            } catch {
              return false;
            }
          })
          .map((u) => u.id);
        whereBase.userId = { in: [context.userId, ...teamUserIds] };
      }

      const absences = await this.prisma.absence.findMany({
        where: whereBase as unknown as Prisma.AbsenceWhereInput,
        include: {
          user: { select: { firstname: true, lastname: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const results = absences.map((a) => {
        const dec = decryptUser(a.user);
        return {
          employé:
            `${dec.firstname || ''} ${dec.lastname || ''}`.trim() ||
            dec.username,
          type: TYPE_LABELS[a.type] ?? a.type,
          dateDebut: a.startDate.toISOString().slice(0, 10),
          dateFin: a.endDate.toISOString().slice(0, 10),
          statut: STATUS_LABELS[a.status] ?? a.status,
        };
      });

      return {
        success: true,
        data: {
          nombreDemandes: results.length,
          demandes: results,
        },
      };
    } catch {
      return {
        success: false,
        error: "Erreur lors de la récupération des demandes d'absence.",
      };
    }
  }
}
