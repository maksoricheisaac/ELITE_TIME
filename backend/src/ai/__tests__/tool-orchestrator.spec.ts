import { Test, TestingModule } from '@nestjs/testing';
import { ToolOrchestratorService } from '../orchestrator/tool-orchestrator.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OllamaService } from '../ollama.service.js';
import { ToolResultCache } from '../cache/tool-result.cache.js';
import { GetMyHoursTool } from '../tools/get-my-hours.tool.js';
import { GetAbsentTodayTool } from '../tools/get-absent-today.tool.js';
import { GetLateEmployeesTool } from '../tools/get-late-employees.tool.js';
import { GetLeaveRequestsTool } from '../tools/get-leave-requests.tool.js';
import { GetTeamAttendanceTool } from '../tools/get-team-attendance.tool.js';
import { GetDepartmentStatisticsTool } from '../tools/get-department-statistics.tool.js';
import { GetMyLeavesSummaryTool } from '../tools/get-my-leaves-summary.tool.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { OllamaChatResponse } from '../interfaces/ollama.types.js';

/** Réponse Ollama sans tool_call (réponse finale) */
const makeFinalResponse = (text: string) => ({
  model: 'qwen2.5',
  message: { role: 'assistant' as const, content: text, tool_calls: [] },
  done: true,
});

/** Réponse Ollama avec un appel d'outil */
const makeToolCallResponse = (
  toolName: string,
  toolArgs: Record<string, unknown> = {},
) => ({
  model: 'qwen2.5',
  message: {
    role: 'assistant' as const,
    content: '',
    tool_calls: [{ function: { name: toolName, arguments: toolArgs } }],
  },
  done: false,
});

const EMPLOYEE_CONTEXT: ToolContext = {
  userId: 'user-1',
  role: 'employee',
  department: 'IT',
};

const MANAGER_CONTEXT: ToolContext = {
  userId: 'user-2',
  role: 'manager',
  department: 'IT',
};

const mockPrisma = {
  pointage: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  absence: { findMany: jest.fn().mockResolvedValue([]) },
  department: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('ToolOrchestratorService', () => {
  let service: ToolOrchestratorService;
  let ollamaService: jest.Mocked<OllamaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolOrchestratorService,
        ToolResultCache,
        {
          provide: OllamaService,
          useValue: {
            chat: jest.fn(),
            model: 'qwen2.5',
            config: { temperature: 0.1, maxPredictTokens: 512 },
            isAvailable: jest.fn(),
            chatStream: jest.fn(),
          },
        },
        {
          provide: GetMyHoursTool,
          useValue: new GetMyHoursTool(mockPrisma as unknown as PrismaService),
        },
        {
          provide: GetAbsentTodayTool,
          useValue: new GetAbsentTodayTool(
            mockPrisma as unknown as PrismaService,
          ),
        },
        {
          provide: GetLateEmployeesTool,
          useValue: new GetLateEmployeesTool(
            mockPrisma as unknown as PrismaService,
          ),
        },
        {
          provide: GetLeaveRequestsTool,
          useValue: new GetLeaveRequestsTool(
            mockPrisma as unknown as PrismaService,
          ),
        },
        {
          provide: GetTeamAttendanceTool,
          useValue: new GetTeamAttendanceTool(
            mockPrisma as unknown as PrismaService,
          ),
        },
        {
          provide: GetDepartmentStatisticsTool,
          useValue: new GetDepartmentStatisticsTool(
            mockPrisma as unknown as PrismaService,
          ),
        },
        {
          provide: GetMyLeavesSummaryTool,
          useValue: new GetMyLeavesSummaryTool(
            mockPrisma as unknown as PrismaService,
          ),
        },
      ],
    }).compile();

    service = module.get<ToolOrchestratorService>(ToolOrchestratorService);
    ollamaService = module.get(OllamaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // Réponse directe sans outil
  // ─────────────────────────────────────────────────────────────────
  describe('réponse directe', () => {
    it('retourne la réponse Ollama directement si aucun tool_call', async () => {
      ollamaService.chat.mockResolvedValue(
        makeFinalResponse('Bonjour, comment puis-je vous aider ?'),
      );

      const result = await service.process('Bonjour', [], EMPLOYEE_CONTEXT);
      expect(result.response).toBe('Bonjour, comment puis-je vous aider ?');
      expect(result.toolsUsed).toEqual([]);
    });

    it('retourne un message par défaut si content vide', async () => {
      ollamaService.chat.mockResolvedValue(makeFinalResponse(''));

      const result = await service.process('test', [], EMPLOYEE_CONTEXT);
      expect(result.response).toContain('Je ne dispose pas');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Appel d'outil valide
  // ─────────────────────────────────────────────────────────────────
  describe('tool call valide', () => {
    it('exécute get_my_hours pour un employee', async () => {
      ollamaService.chat
        .mockResolvedValueOnce(
          makeToolCallResponse('get_my_hours', { period: 'week' }),
        )
        .mockResolvedValueOnce(
          makeFinalResponse('Vous avez travaillé 35h cette semaine.'),
        );

      const result = await service.process(
        'Mes heures de la semaine',
        [],
        EMPLOYEE_CONTEXT,
      );
      expect(result.toolsUsed).toContain('get_my_hours');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Filtrage RBAC des tool definitions envoyées à Ollama
  // ─────────────────────────────────────────────────────────────────
  describe('filtrage tools par rôle', () => {
    it("n'envoie pas get_department_statistics à Ollama pour un employee", async () => {
      ollamaService.chat.mockResolvedValue(makeFinalResponse('ok'));

      await service.process('test', [], EMPLOYEE_CONTEXT);

      const chatArgs = ollamaService.chat.mock.calls[0][0];
      const toolNames =
        (
          chatArgs.tools as Array<{ function: { name: string } }> | undefined
        )?.map((t) => t.function.name) ?? [];
      expect(toolNames).not.toContain('get_department_statistics');
      expect(toolNames).not.toContain('get_absent_today');
    });

    it('envoie get_department_statistics à Ollama pour un admin', async () => {
      ollamaService.chat.mockResolvedValue(makeFinalResponse('ok'));

      await service.process('test', [], { ...MANAGER_CONTEXT, role: 'admin' });

      const chatArgs = ollamaService.chat.mock.calls[0][0];
      const toolNames =
        (
          chatArgs.tools as Array<{ function: { name: string } }> | undefined
        )?.map((t) => t.function.name) ?? [];
      expect(toolNames).toContain('get_department_statistics');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Blocage outil inconnu
  // ─────────────────────────────────────────────────────────────────
  describe('outil inconnu', () => {
    it('ne crash pas si le LLM demande un outil inconnu', async () => {
      ollamaService.chat
        .mockResolvedValueOnce(makeToolCallResponse('hack_database', {}))
        .mockResolvedValueOnce(
          makeFinalResponse('Désolé, je ne peux pas faire ça.'),
        );

      const result = await service.process('test', [], EMPLOYEE_CONTEXT);
      expect(result.toolsUsed).not.toContain('hack_database');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Blocage RBAC au niveau orchestrateur
  // ─────────────────────────────────────────────────────────────────
  describe('blocage RBAC orchestrateur', () => {
    it('bloque get_absent_today pour un employee même si le LLM le demande', async () => {
      ollamaService.chat
        .mockResolvedValueOnce(makeToolCallResponse('get_absent_today', {}))
        .mockResolvedValueOnce(makeFinalResponse('Accès refusé.'));

      const result = await service.process(
        'qui est absent ?',
        [],
        EMPLOYEE_CONTEXT,
      );
      // L'outil est bloqué par l'orchestrateur → non ajouté à toolsUsed
      expect(result.toolsUsed).not.toContain('get_absent_today');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Limite MAX_TOOL_ITERATIONS
  // ─────────────────────────────────────────────────────────────────
  describe("limite d'itérations", () => {
    it('stoppe après 3 itérations outil et retourne un message de fallback', async () => {
      // Après 3 itérations de tool calls, le 4e appel synthétise une réponse finale
      ollamaService.chat
        .mockResolvedValueOnce(
          makeToolCallResponse('get_my_hours', { period: 'week' }),
        )
        .mockResolvedValueOnce(
          makeToolCallResponse('get_my_hours', { period: 'week' }),
        )
        .mockResolvedValueOnce(
          makeToolCallResponse('get_my_hours', { period: 'week' }),
        )
        .mockResolvedValueOnce(makeFinalResponse('Voici la synthèse.'));

      const result = await service.process('test', [], EMPLOYEE_CONTEXT);
      // Les 3 itérations de tool calls + 1 synthèse finale = 4 appels
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(ollamaService.chat).toHaveBeenCalledTimes(4);
      expect(result.toolsUsed).toContain('get_my_hours');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Réponse Ollama invalide
  // ─────────────────────────────────────────────────────────────────
  describe('réponse Ollama invalide', () => {
    it('gère une réponse Ollama sans message', async () => {
      ollamaService.chat.mockResolvedValue(
        null as unknown as OllamaChatResponse,
      );

      const result = await service.process('test', [], EMPLOYEE_CONTEXT);
      expect(result.response).toContain("Je n'ai pas pu traiter");
    });

    it('gère une réponse Ollama avec message null', async () => {
      ollamaService.chat.mockResolvedValue({
        model: 'test',
        message: null,
        done: true,
      } as unknown as OllamaChatResponse);

      const result = await service.process('test', [], EMPLOYEE_CONTEXT);
      expect(result.response).toContain("Je n'ai pas pu traiter");
    });
  });
});
