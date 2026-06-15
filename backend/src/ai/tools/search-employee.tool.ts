import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptUser } from '../../lib/prisma-crypto.helper.js';
import type { AiTool, AiToolResult } from './ai-tool.interface.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaTool } from '../interfaces/ollama.types.js';
import { validateSearchEmployeeArgs } from './tool-args.validator.js';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  team_lead: "Chef d'équipe",
  employee: 'Employé',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
};

@Injectable()
export class SearchEmployeeTool implements AiTool {
  constructor(private readonly prisma: PrismaService) {}

  readonly definition: OllamaTool = {
    type: 'function',
    function: {
      name: 'search_employee',
      description:
        "Recherche un employé par son nom, prénom ou nom d'utilisateur et retourne son département, poste, rôle et statut. Réservé aux managers, team leads et admins.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nom, prénom ou nom d’utilisateur à rechercher.',
          },
        },
        required: ['query'],
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
        error: "Vous n'avez pas les permissions pour rechercher un employé.",
      };
    }

    const validation = validateSearchEmployeeArgs(args);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const query = (validation.sanitized.query as string).toLowerCase();

      const users = await this.prisma.user.findMany({
        where: { status: 'active' },
        select: {
          firstname: true,
          lastname: true,
          username: true,
          email: true,
          department: true,
          position: true,
          role: true,
          status: true,
        },
        take: 500,
      });

      let results = users
        .map((u) => decryptUser(u))
        .filter((u) => {
          const fullName = `${u.firstname ?? ''} ${u.lastname ?? ''}`.toLowerCase();
          return (
            fullName.includes(query) ||
            (u.username ?? '').toLowerCase().includes(query)
          );
        });

      if (context.role === 'team_lead' && context.department) {
        results = results.filter((u) => u.department === context.department);
      }

      const employés = results.slice(0, 10).map((u) => ({
        nom: `${u.firstname || ''} ${u.lastname || ''}`.trim() || u.username,
        département: u.department ?? null,
        poste: u.position ?? null,
        rôle: ROLE_LABELS[u.role] ?? u.role,
        statut: STATUS_LABELS[u.status] ?? u.status,
      }));

      return {
        success: true,
        data: {
          nombreRésultats: employés.length,
          employés,
        },
      };
    } catch {
      return {
        success: false,
        error: "Erreur lors de la recherche d'employé.",
      };
    }
  }
}
