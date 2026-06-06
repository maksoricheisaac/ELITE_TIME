import { Injectable, OnModuleDestroy } from '@nestjs/common';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AiRequestRecord {
  userId: string;
  role: string;
  durationMs: number;
  toolsUsed: string[];
  streaming: boolean;
  isError: boolean;
  errorType: string | null;
  cacheHits: number;
  timestamp: Date;
}

export interface AiMetricsSummary {
  totalRequests: number;
  totalErrors: number;
  errorRate: string;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  streamingRequests: number;
  cacheHitTotal: number;
  topTools: Array<{ name: string; count: number }>;
  requestsLastHour: number;
  requestsLast24h: number;
  errorsByType: Record<string, number>;
  activeUsers: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

const ROLLING_WINDOW_SIZE = 2000; // Max entrées conservées
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Nettoyage toutes les 10 min

@Injectable()
export class AiMetricsService implements OnModuleDestroy {
  private readonly records: AiRequestRecord[] = [];
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Nettoyage périodique des anciennes métriques (> 24h)
    this.cleanupTimer = setInterval(() => this.evictOld(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  record(metric: AiRequestRecord): void {
    this.records.push(metric);
    // Garde une fenêtre glissante
    if (this.records.length > ROLLING_WINDOW_SIZE) {
      this.records.shift();
    }
  }

  getSummary(): AiMetricsSummary {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const total = this.records.length;
    const errors = this.records.filter((r) => r.isError);
    const latencies = this.records
      .map((r) => r.durationMs)
      .sort((a, b) => a - b);

    const toolCounts: Record<string, number> = {};
    const errorTypes: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    let cacheHitTotal = 0;
    let streamingCount = 0;

    for (const r of this.records) {
      uniqueUsers.add(r.userId);
      cacheHitTotal += r.cacheHits;
      if (r.streaming) streamingCount++;
      for (const tool of r.toolsUsed) {
        toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
      }
      if (r.errorType) {
        errorTypes[r.errorType] = (errorTypes[r.errorType] ?? 0) + 1;
      }
    }

    const topTools = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      totalRequests: total,
      totalErrors: errors.length,
      errorRate:
        total > 0 ? `${((errors.length / total) * 100).toFixed(1)}%` : '0%',
      averageLatencyMs:
        latencies.length > 0
          ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
          : 0,
      p95LatencyMs: this.percentile(latencies, 0.95),
      p99LatencyMs: this.percentile(latencies, 0.99),
      streamingRequests: streamingCount,
      cacheHitTotal,
      topTools,
      requestsLastHour: this.records.filter(
        (r) => r.timestamp.getTime() > oneHourAgo,
      ).length,
      requestsLast24h: this.records.filter(
        (r) => r.timestamp.getTime() > oneDayAgo,
      ).length,
      errorsByType: errorTypes,
      activeUsers: uniqueUsers.size,
    };
  }

  getRecentErrors(limit = 20): AiRequestRecord[] {
    return this.records
      .filter((r) => r.isError)
      .slice(-limit)
      .reverse();
  }

  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const idx = Math.ceil(sortedArr.length * p) - 1;
    return sortedArr[Math.min(idx, sortedArr.length - 1)];
  }

  private evictOld(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let i = 0;
    while (
      i < this.records.length &&
      this.records[i].timestamp.getTime() < cutoff
    ) {
      i++;
    }
    if (i > 0) this.records.splice(0, i);
  }
}
