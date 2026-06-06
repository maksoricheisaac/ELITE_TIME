import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { AiToolResult } from '../tools/ai-tool.interface.js';

// ─── TTL par outil ─────────────────────────────────────────────────────────────
// Données en temps réel → TTL court | données historiques → TTL long

const TOOL_TTL_MS: Record<string, number> = {
  get_absent_today: 2 * 60 * 1000, // 2 min — données très dynamiques
  get_late_employees: 3 * 60 * 1000, // 3 min
  get_team_attendance: 3 * 60 * 1000, // 3 min
  get_department_statistics: 5 * 60 * 1000, // 5 min — agrégats
  get_leave_requests: 5 * 60 * 1000, // 5 min
  get_my_hours: 5 * 60 * 1000, // 5 min — données personnelles
  get_my_leaves_summary: 10 * 60 * 1000, // 10 min — données historiques stables
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ─── Périmètre de cache ────────────────────────────────────────────────────────

/**
 * Détermine si une entrée de cache est partageable entre utilisateurs du même rôle.
 * get_my_hours et get_my_leaves_summary sont des données personnelles → cache par userId.
 * Les autres outils retournent des données d'équipe → cache par département/rôle.
 */
const PERSONAL_TOOLS = new Set([
  'get_my_hours',
  'get_my_leaves_summary',
  'get_leave_requests',
]);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: AiToolResult;
  expiresAt: number;
  toolName: string;
  scope: string;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: string;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ToolResultCache implements OnModuleDestroy {
  private readonly logger = new Logger(ToolResultCache.name);
  private readonly store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.evictExpired(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Construit la clé de cache.
   * - Outils personnels : scopés par userId + args
   * - Outils équipe : scopés par rôle + département + args
   */
  buildKey(
    toolName: string,
    args: Record<string, unknown>,
    context: { userId: string; role: string; department?: string | null },
  ): string {
    const argsKey = Object.entries(args)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&');

    if (PERSONAL_TOOLS.has(toolName)) {
      return `${toolName}:user:${context.userId}:${argsKey}`;
    }

    // Scope équipe : par rôle (team_lead filtre par département)
    const deptSuffix =
      context.role === 'team_lead'
        ? `:dept:${context.department ?? 'all'}`
        : '';
    return `${toolName}:role:${context.role}${deptSuffix}:${argsKey}`;
  }

  get(key: string): AiToolResult | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    this.logger.debug(`Cache HIT: ${key}`);
    return entry.result;
  }

  set(key: string, result: AiToolResult, toolName: string): void {
    const ttl = TOOL_TTL_MS[toolName] ?? DEFAULT_TTL_MS;
    this.store.set(key, {
      result,
      expiresAt: Date.now() + ttl,
      toolName,
      scope: key.split(':')[1] ?? 'unknown',
    });
    this.logger.debug(`Cache SET: ${key} (TTL ${ttl / 1000}s)`);
  }

  /** Invalide toutes les entrées d'un outil (ex: après une modification de données) */
  invalidateTool(toolName: string): void {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(`${toolName}:`)) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.log(
        `Cache invalidé pour outil "${toolName}": ${removed} entrée(s)`,
      );
    }
  }

  /** Vide tout le cache */
  flush(): void {
    const count = this.store.size;
    this.store.clear();
    this.logger.log(`Cache entièrement vidé (${count} entrées)`);
  }

  private evictExpired(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(
        `Cache eviction: ${removed} entrée(s) expirée(s) supprimée(s)`,
      );
    }
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? `${Math.round((this.hits / total) * 100)}%` : '0%',
    };
  }
}
