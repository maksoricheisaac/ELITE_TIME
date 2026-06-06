import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface.js';
import { AiService } from './ai.service.js';
import { OllamaService } from './ollama.service.js';
import { AiMetricsService } from './metrics/ai-metrics.service.js';
import { ToolResultCache } from './cache/tool-result.cache.js';
import { AiRequestQueue } from './queue/ai-request.queue.js';
import { ChatRequestDto } from './dto/chat.dto.js';

@Controller('ai')
@UseGuards(AuthGuard, PermissionsGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly ollamaService: OllamaService,
    private readonly metrics: AiMetricsService,
    private readonly toolCache: ToolResultCache,
    private readonly requestQueue: AiRequestQueue,
  ) {}

  // ─── Chat non-streaming (rétrocompatible) ──────────────────────────────────

  @Post('chat')
  async chat(
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!this.aiService.checkRateLimit(user.id)) {
      throw new HttpException(
        'Limite de requêtes atteinte. Veuillez réessayer dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.aiService.chat(dto, user);
  }

  // ─── Chat streaming SSE ────────────────────────────────────────────────────

  /**
   * Endpoint SSE : retourne la réponse token par token.
   * Client : EventSource ou fetch avec ReadableStream.
   * Headers SSE définis manuellement pour compatibilité NestJS + nginx.
   */
  @Post('chat/stream')
  async chatStream(
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Rate limit
    if (!this.aiService.checkRateLimit(user.id)) {
      res.status(429).json({
        message:
          'Limite de requêtes atteinte. Veuillez réessayer dans quelques minutes.',
      });
      return;
    }

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Désactive le buffering nginx
    const allowedOrigins = (process.env.NEXT_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const requestOrigin = req.headers.origin ?? '';
    const corsOrigin = allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : (allowedOrigins[0] ?? 'null');
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.flushHeaders();

    // Keep-alive ping toutes les 20s pour éviter les timeouts proxy
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 20_000);

    try {
      await this.aiService.chatStream(dto, user, res);
    } finally {
      clearInterval(keepAlive);
    }
  }

  // ─── Santé ─────────────────────────────────────────────────────────────────

  @Get('health')
  async health() {
    const available = await this.ollamaService.isAvailable();
    const circuit = this.ollamaService.getCircuitStats();
    return {
      status: available ? 'ok' : 'degraded',
      ollama: available,
      model: this.ollamaService.model,
      modelDisplayName: this.ollamaService.config.displayName,
      circuit: {
        state: circuit.state,
        failures: circuit.failures,
      },
    };
  }

  // ─── Métriques admin ───────────────────────────────────────────────────────

  @Get('metrics')
  @RequirePermissions('ai.view_metrics')
  getMetrics() {
    const metricsSummary = this.metrics.getSummary();
    const cacheStats = this.toolCache.getStats();
    const queueStats = this.requestQueue.getStats();
    const circuitStats = this.ollamaService.getCircuitStats();

    return {
      timestamp: new Date().toISOString(),
      requests: {
        total: metricsSummary.totalRequests,
        errors: metricsSummary.totalErrors,
        errorRate: metricsSummary.errorRate,
        lastHour: metricsSummary.requestsLastHour,
        last24h: metricsSummary.requestsLast24h,
        streaming: metricsSummary.streamingRequests,
        activeUsers: metricsSummary.activeUsers,
      },
      latency: {
        averageMs: metricsSummary.averageLatencyMs,
        p95Ms: metricsSummary.p95LatencyMs,
        p99Ms: metricsSummary.p99LatencyMs,
      },
      tools: {
        topUsed: metricsSummary.topTools,
        cacheHits: metricsSummary.cacheHitTotal,
      },
      cache: cacheStats,
      queue: queueStats,
      circuit: circuitStats,
      errorsByType: metricsSummary.errorsByType,
    };
  }

  // ─── Actions admin ─────────────────────────────────────────────────────────

  @Post('cache/flush')
  @RequirePermissions('ai.manage_cache')
  flushCache() {
    this.toolCache.flush();
    return { message: 'Cache vidé avec succès.' };
  }

  @Post('circuit/reset')
  @RequirePermissions('ai.manage_circuit')
  resetCircuit() {
    this.ollamaService.resetCircuit();
    return { message: 'Circuit breaker réinitialisé.' };
  }
}
