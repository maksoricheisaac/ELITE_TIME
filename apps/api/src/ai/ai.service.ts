import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolOrchestratorService } from './orchestrator/tool-orchestrator.service.js';
import { AiMetricsService } from './metrics/ai-metrics.service.js';
import { AiRequestQueue } from './queue/ai-request.queue.js';
import { encryptActivityLog } from '../lib/prisma-crypto.helper.js';
import { validateAiRole } from './security/ai-rbac.js';
import {
  sanitizeAiInput,
  validateAiMessage,
} from './security/prompt-injection.guard.js';
import type { ToolContext } from './interfaces/tool-context.interface.js';
import type { ChatRequestDto } from './dto/chat.dto.js';

/** 60 requêtes par heure par utilisateur */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

@Injectable()
export class AiService implements OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ToolOrchestratorService,
    private readonly metrics: AiMetricsService,
    private readonly queue: AiRequestQueue,
  ) {
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredRateLimitEntries(),
      RATE_LIMIT_CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanupExpiredRateLimitEntries(): void {
    const now = Date.now();
    let removed = 0;
    for (const [userId, entry] of this.rateLimitMap.entries()) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        this.rateLimitMap.delete(userId);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Rate limit cleanup: ${removed} entrées supprimées.`);
    }
  }

  checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.rateLimitMap.set(userId, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
  }

  // ─── Chat non-streaming (rétrocompatible) ─────────────────────────────────

  async chat(
    dto: ChatRequestDto,
    user: { id: string; role: string; department?: string | null },
  ): Promise<{ message: string; toolsUsed?: string[] }> {
    const validatedRole = validateAiRole(user.role);

    const sanitizedMessage = sanitizeAiInput(dto.message);
    const messageCheck = validateAiMessage(sanitizedMessage);
    if (!messageCheck.clean) {
      this.logger.warn(
        `Message refusé pour user ${user.id}: ${messageCheck.reason}`,
      );
      return {
        message:
          'Votre message ne peut pas être traité. Veuillez le reformuler.',
      };
    }

    const history = (dto.history ?? []).map((h) => ({
      role: h.role,
      content: sanitizeAiInput(h.content, 2000),
    }));

    const context: ToolContext = {
      userId: user.id,
      role: validatedRole,
      department: typeof user.department === 'string' ? user.department : null,
    };

    const startTime = Date.now();

    try {
      const result = await this.queue.run(() =>
        this.orchestrator.process(sanitizedMessage, history, context),
      );
      const durationMs = Date.now() - startTime;

      this.metrics.record({
        userId: user.id,
        role: validatedRole,
        durationMs,
        toolsUsed: result.toolsUsed,
        streaming: false,
        isError: false,
        errorType: null,
        cacheHits: result.cacheHits,
        timestamp: new Date(),
      });

      await this.writeActivityLog(
        user.id,
        'AI_CHAT',
        `outils=[${result.toolsUsed.join(',')}] duree=${durationMs}ms`,
      );

      return { message: result.response, toolsUsed: result.toolsUsed };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const isOllamaError =
        err instanceof Error && err.message.toLowerCase().includes('ollama');
      const errorType = isOllamaError ? 'OllamaUnavailable' : 'InternalError';

      this.logger.error(
        `AI chat error for user ${user.id}: ${err instanceof Error ? err.message : 'Unknown'}`,
      );

      this.metrics.record({
        userId: user.id,
        role: validatedRole,
        durationMs,
        toolsUsed: [],
        streaming: false,
        isError: true,
        errorType,
        cacheHits: 0,
        timestamp: new Date(),
      });

      await this.writeActivityLog(
        user.id,
        'AI_CHAT_ERROR',
        isOllamaError ? 'Ollama indisponible' : 'Erreur interne',
      ).catch(() => void 0);

      if (isOllamaError) {
        return {
          message:
            "L'assistant IA est temporairement indisponible. Veuillez réessayer.",
        };
      }
      return { message: 'Une erreur est survenue. Veuillez réessayer.' };
    }
  }

  // ─── Chat streaming SSE ────────────────────────────────────────────────────

  async chatStream(
    dto: ChatRequestDto,
    user: { id: string; role: string; department?: string | null },
    res: Response,
  ): Promise<void> {
    let validatedRole: ReturnType<typeof validateAiRole>;
    try {
      validatedRole = validateAiRole(user.role);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        this.writeSseEvent(res, 'error', { message: 'Accès refusé.' });
        res.end();
        return;
      }
      throw err;
    }

    const sanitizedMessage = sanitizeAiInput(dto.message);
    const messageCheck = validateAiMessage(sanitizedMessage);
    if (!messageCheck.clean) {
      this.writeSseEvent(res, 'error', {
        message:
          'Votre message ne peut pas être traité. Veuillez le reformuler.',
      });
      res.end();
      return;
    }

    const history = (dto.history ?? []).map((h) => ({
      role: h.role,
      content: sanitizeAiInput(h.content, 2000),
    }));

    const context: ToolContext = {
      userId: user.id,
      role: validatedRole,
      department: typeof user.department === 'string' ? user.department : null,
    };

    const startTime = Date.now();
    const toolsUsed: string[] = [];
    let hasError = false;

    // AbortController lié à la déconnexion du client
    const abortController = new AbortController();
    (
      res as unknown as { req: { on: (event: string, cb: () => void) => void } }
    ).req?.on('close', () => {
      abortController.abort();
    });

    try {
      await this.queue.run(async () => {
        const generator = this.orchestrator.processStream(
          sanitizedMessage,
          history,
          context,
          abortController.signal,
        );

        for await (const event of generator) {
          if (abortController.signal.aborted) break;

          this.writeSseEvent(res, event.type, event);

          if (event.type === 'tool_call') {
            toolsUsed.push((event as { name: string }).name);
          }
          if (event.type === 'error') {
            hasError = true;
          }
        }
      });
    } catch (err: unknown) {
      hasError = true;
      const msg =
        err instanceof Error
          ? err.message.includes('indisponible') ||
            err.message.includes('surchargé')
            ? err.message
            : 'Une erreur est survenue. Veuillez réessayer.'
          : 'Une erreur est survenue.';
      this.writeSseEvent(res, 'error', { message: msg });
    } finally {
      const durationMs = Date.now() - startTime;

      this.metrics.record({
        userId: user.id,
        role: validatedRole,
        durationMs,
        toolsUsed,
        streaming: true,
        isError: hasError,
        errorType: hasError ? 'StreamError' : null,
        cacheHits: 0,
        timestamp: new Date(),
      });

      await this.writeActivityLog(
        user.id,
        hasError ? 'AI_CHAT_ERROR' : 'AI_CHAT',
        `stream=true outils=[${toolsUsed.join(',')}] duree=${Date.now() - startTime}ms`,
      ).catch(() => void 0);

      res.end();
    }
  }

  /** Formate et écrit un événement SSE */
  private writeSseEvent(res: Response, eventType: string, data: unknown): void {
    if (res.writableEnded) return;
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private async writeActivityLog(
    userId: string,
    action: string,
    details: string,
  ): Promise<void> {
    const encrypted = encryptActivityLog({ action, details });
    await this.prisma.activityLog.create({
      data: {
        userId,
        action: encrypted.action as string,
        details: encrypted.details as string,
        timestamp: new Date(),
        type: 'user',
      },
    });
  }
}
