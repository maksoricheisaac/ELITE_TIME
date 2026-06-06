import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../ollama.service.js';
import {
  buildSystemPrompt,
  type PromptToolDef,
} from '../prompts/system-prompt.js';
import { ToolResultCache } from '../cache/tool-result.cache.js';
import type { OllamaMessage } from '../interfaces/ollama.types.js';
import type { ToolContext } from '../interfaces/tool-context.interface.js';
import type { AiTool, AiToolResult } from '../tools/ai-tool.interface.js';
import type { SseEvent } from '../interfaces/streaming.types.js';
import { GetMyHoursTool } from '../tools/get-my-hours.tool.js';
import { GetAbsentTodayTool } from '../tools/get-absent-today.tool.js';
import { GetLateEmployeesTool } from '../tools/get-late-employees.tool.js';
import { GetLeaveRequestsTool } from '../tools/get-leave-requests.tool.js';
import { GetTeamAttendanceTool } from '../tools/get-team-attendance.tool.js';
import { GetDepartmentStatisticsTool } from '../tools/get-department-statistics.tool.js';
import { GetMyLeavesSummaryTool } from '../tools/get-my-leaves-summary.tool.js';
import {
  getAllowedToolNames,
  isToolAllowedForRole,
} from '../security/ai-rbac.js';

const MAX_TOOL_ITERATIONS = 3;
const MAX_TOOL_CALLS_PER_ITERATION = 3;
const MAX_TOOL_RESULT_SIZE = 8_000;

const TOOL_DISPLAY_LABELS: Record<string, string> = {
  get_my_hours: 'Mes heures',
  get_absent_today: 'Absents du jour',
  get_late_employees: 'Retards',
  get_leave_requests: 'Demandes congé',
  get_team_attendance: 'Présences équipe',
  get_department_statistics: 'Stats département',
  get_my_leaves_summary: 'Résumé congés',
};

interface ToolLoopResult {
  messages: OllamaMessage[];
  toolsUsed: string[];
  cacheHits: number;
  directResponse: string | null;
}

// ─── Parsing JSON tool call depuis le texte brut du modèle ───────────────────

interface ParsedToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Extrait un appel d'outil depuis le texte brut.
 * Le modèle émet : {"tool":"nom","args":{...}}
 * On cherche le premier bloc JSON contenant "tool".
 */
function parseToolCallFromContent(content: string): ParsedToolCall | null {
  const trimmed = content.trim();

  // Chercher la première occurrence de '{'
  const start = trimmed.indexOf('{');
  if (start === -1) return null;

  // Trouver le JSON complet en comptant les accolades
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === '{') depth++;
    else if (trimmed[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  try {
    const raw = trimmed.slice(start, end + 1);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.tool !== 'string' || !parsed.tool) return null;
    return {
      tool: parsed.tool,
      args:
        parsed.args &&
        typeof parsed.args === 'object' &&
        !Array.isArray(parsed.args)
          ? (parsed.args as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

/** Construit les PromptToolDef à partir des définitions OllamaTool */
function toPromptToolDefs(tools: AiTool[]): PromptToolDef[] {
  return tools.map((t) => {
    const fn = t.definition.function;
    const props = fn.parameters?.properties ?? {};
    const required = new Set(fn.parameters?.required ?? []);

    const params: PromptToolDef['params'] =
      Object.keys(props).length > 0
        ? Object.fromEntries(
            Object.entries(props).map(([k, v]) => [
              k,
              {
                type: v.type,
                description: v.description,
                optional: !required.has(k),
              },
            ]),
          )
        : undefined;

    return { name: fn.name, description: fn.description, params };
  });
}

// ─── Few-shot examples ───────────────────────────────────────────────────────

/**
 * Génère 1-2 paires user/assistant/tool/assistant montrant le comportement attendu.
 * Adapté au rôle : utilise uniquement des outils autorisés pour ce rôle.
 */
function buildFewShotExamples(
  role: string,
  allowedNames: Set<string>,
): OllamaMessage[] {
  const examples: OllamaMessage[] = [];

  // Exemple universel : mes heures (dispo pour tous les rôles)
  if (allowedNames.has('get_my_hours')) {
    examples.push(
      {
        role: 'user',
        content: "Combien d'heures ai-je travaillé cette semaine ?",
      },
      { role: 'assistant', content: '{"tool":"get_my_hours","args":{}}' },
      {
        role: 'tool',
        content:
          '[TOOL_RESULT] {"success":true,"data":{"period":"week","totalHours":34.5,"days":[{"date":"2026-05-26","hours":7.0},{"date":"2026-05-27","hours":6.5}]}}',
      },
      {
        role: 'assistant',
        content:
          'Cette semaine, vous avez travaillé 34,5 heures au total. La journée de lundi comptait 7h et mardi 6h30.',
      },
    );
  }

  // Exemple manager/admin : retards (si autorisé)
  if (allowedNames.has('get_late_employees') && role !== 'employee') {
    examples.push(
      { role: 'user', content: "Qui est arrivé en retard aujourd'hui ?" },
      { role: 'assistant', content: '{"tool":"get_late_employees","args":{}}' },
      {
        role: 'tool',
        content:
          '[TOOL_RESULT] {"success":true,"data":{"date":"2026-05-27","nombreRetards":2,"employés":[{"nom":"Alice Martin","département":"IT","heureEntrée":"09:12"},{"nom":"Bob Durand","département":"RH","heureEntrée":"09:45"}]}}',
      },
      {
        role: 'assistant',
        content:
          "Aujourd'hui, 2 employés sont arrivés en retard : Alice Martin (IT, 09h12) et Bob Durand (RH, 09h45).",
      },
    );
  }

  return examples;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ToolOrchestratorService {
  private readonly logger = new Logger(ToolOrchestratorService.name);
  private readonly toolRegistry: Map<string, AiTool>;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly toolCache: ToolResultCache,
    private readonly getMyHoursTool: GetMyHoursTool,
    private readonly getAbsentTodayTool: GetAbsentTodayTool,
    private readonly getLateEmployeesTool: GetLateEmployeesTool,
    private readonly getLeaveRequestsTool: GetLeaveRequestsTool,
    private readonly getTeamAttendanceTool: GetTeamAttendanceTool,
    private readonly getDepartmentStatisticsTool: GetDepartmentStatisticsTool,
    private readonly getMyLeavesSummaryTool: GetMyLeavesSummaryTool,
  ) {
    const entries: [string, AiTool][] = [
      [getMyHoursTool.definition.function.name, getMyHoursTool],
      [getAbsentTodayTool.definition.function.name, getAbsentTodayTool],
      [getLateEmployeesTool.definition.function.name, getLateEmployeesTool],
      [getLeaveRequestsTool.definition.function.name, getLeaveRequestsTool],
      [getTeamAttendanceTool.definition.function.name, getTeamAttendanceTool],
      [
        getDepartmentStatisticsTool.definition.function.name,
        getDepartmentStatisticsTool,
      ],
      [getMyLeavesSummaryTool.definition.function.name, getMyLeavesSummaryTool],
    ];
    this.toolRegistry = new Map(entries);
  }

  // ─── API non-streaming ────────────────────────────────────────────────────

  async process(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    context: ToolContext,
  ): Promise<{ response: string; toolsUsed: string[]; cacheHits: number }> {
    const loopResult = await this.runToolLoop(message, history, context);

    if (loopResult.directResponse !== null) {
      return {
        response: loopResult.directResponse,
        toolsUsed: loopResult.toolsUsed,
        cacheHits: loopResult.cacheHits,
      };
    }

    if (loopResult.toolsUsed.length === 0) {
      return {
        response:
          "Je n'ai pas pu traiter complètement votre demande. Veuillez la reformuler.",
        toolsUsed: loopResult.toolsUsed,
        cacheHits: loopResult.cacheHits,
      };
    }

    // Synthèse finale après tool calls
    const finalResponse = await this.ollamaService.chat({
      model: this.ollamaService.model,
      messages: loopResult.messages,
      tools: [],
      stream: false,
      options: {
        temperature: this.ollamaService.config.temperature,
        num_predict: this.ollamaService.config.maxPredictTokens,
      },
    });

    const text = finalResponse?.message?.content?.trim();
    return {
      response:
        text ||
        'Je ne dispose pas des informations nécessaires pour répondre à cette demande.',
      toolsUsed: loopResult.toolsUsed,
      cacheHits: loopResult.cacheHits,
    };
  }

  // ─── API streaming ────────────────────────────────────────────────────────

  async *processStream(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    context: ToolContext,
    signal?: AbortSignal,
  ): AsyncGenerator<SseEvent> {
    let loopResult: ToolLoopResult;
    try {
      loopResult = await this.runToolLoop(message, history, context);
    } catch (err) {
      yield {
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Erreur de récupération des données.',
      };
      return;
    }

    for (const tool of loopResult.toolsUsed) {
      yield { type: 'tool_call', name: tool, label: TOOL_DISPLAY_LABELS[tool] };
    }

    if (loopResult.directResponse !== null) {
      const text = loopResult.directResponse;
      const chunkSize = 5;
      for (let i = 0; i < text.length; i += chunkSize) {
        if (signal?.aborted) return;
        yield { type: 'token', content: text.slice(i, i + chunkSize) };
      }
      yield { type: 'done', toolsUsed: loopResult.toolsUsed };
      return;
    }

    try {
      const streamRequest = {
        model: this.ollamaService.model,
        messages: loopResult.messages,
        tools: [],
        options: {
          temperature: this.ollamaService.config.temperature,
          num_predict: this.ollamaService.config.maxPredictTokens,
        },
      };

      for await (const chunk of this.ollamaService.chatStream(
        streamRequest,
        signal,
      )) {
        if (chunk.content) yield { type: 'token', content: chunk.content };
        if (chunk.done) break;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      yield {
        type: 'error',
        message: 'Erreur lors de la génération de la réponse.',
      };
      return;
    }

    yield { type: 'done', toolsUsed: loopResult.toolsUsed };
  }

  // ─── Boucle tool-calling (prompt-engineering) ─────────────────────────────

  private async runToolLoop(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    context: ToolContext,
  ): Promise<ToolLoopResult> {
    const allowedNames = new Set(getAllowedToolNames(context.role));
    const allowedTools = Array.from(this.toolRegistry.values()).filter((t) =>
      allowedNames.has(t.definition.function.name),
    );

    // Injecter les descriptions d'outils dans le system prompt
    const promptToolDefs = toPromptToolDefs(allowedTools);
    const systemPrompt = buildSystemPrompt(
      context.role,
      new Date().toISOString().slice(0, 10),
      promptToolDefs,
    );

    const toolsUsed: string[] = [];
    let cacheHits = 0;

    // Few-shot examples : montrer au modèle le comportement attendu
    const fewShot = buildFewShotExamples(context.role, allowedNames);

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      ...fewShot,
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      // On n'envoie PAS tools[] — le modèle génère du JSON textuel
      const response = await this.ollamaService.chat({
        model: this.ollamaService.model,
        messages,
        tools: [],
        stream: false,
        options: {
          temperature: this.ollamaService.config.temperature,
          num_predict: this.ollamaService.config.maxPredictTokens,
        },
      });

      if (!response?.message) break;
      const content = response.message.content?.trim() ?? '';

      // Détecter si la réponse est un appel d'outil (JSON brut)
      const toolCall = parseToolCallFromContent(content);

      if (!toolCall) {
        // Réponse finale en texte libre
        messages.push({ role: 'assistant', content });
        return {
          messages,
          toolsUsed,
          cacheHits,
          directResponse:
            content || 'Je ne dispose pas des informations nécessaires.',
        };
      }

      // Traiter les tool calls (jusqu'à MAX_TOOL_CALLS_PER_ITERATION)
      // Note: avec prompt-engineering, le modèle émet un seul tool call à la fois
      messages.push({ role: 'assistant', content });

      const callsToProcess = [toolCall].slice(0, MAX_TOOL_CALLS_PER_ITERATION);

      for (const call of callsToProcess) {
        const toolName = call.tool;

        if (!this.toolRegistry.has(toolName)) {
          this.logger.warn(
            `Outil inconnu: "${toolName}" (user=${context.userId})`,
          );
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              success: false,
              error: 'Outil non disponible.',
            }),
          });
          continue;
        }

        if (!isToolAllowedForRole(toolName, context.role)) {
          this.logger.warn(
            `Outil "${toolName}" non autorisé rôle="${context.role}" — BLOQUÉ`,
          );
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              success: false,
              error: 'Permissions insuffisantes.',
            }),
          });
          continue;
        }

        this.logger.log(
          `Tool call: ${toolName} | user=${context.userId} role=${context.role}`,
        );

        const cacheKey = this.toolCache.buildKey(toolName, call.args, context);
        const cached = this.toolCache.get(cacheKey);

        let result: AiToolResult;
        if (cached) {
          result = cached;
          cacheHits++;
        } else {
          const tool = this.toolRegistry.get(toolName)!;
          result = await tool.execute(call.args, context);
          if (result.success) this.toolCache.set(cacheKey, result, toolName);
        }

        toolsUsed.push(toolName);

        let toolResultJson = JSON.stringify(result);
        if (toolResultJson.length > MAX_TOOL_RESULT_SIZE) {
          toolResultJson = JSON.stringify({
            success: true,
            data: { message: 'Résultat partiel.' },
          });
        }

        // Préfixer avec [TOOL_RESULT] pour que le modèle sache que c'est le résultat
        messages.push({
          role: 'tool',
          content: `[TOOL_RESULT] ${toolResultJson}`,
        });
      }

      iterations++;
    }

    return { messages, toolsUsed, cacheHits, directResponse: null };
  }
}
