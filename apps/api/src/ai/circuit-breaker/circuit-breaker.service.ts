import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Nombre d'échecs consécutifs avant ouverture */
  failureThreshold: number;
  /** Durée d'ouverture en ms avant passage HALF_OPEN */
  openTimeoutMs: number;
  /** Nombre de succès consécutifs en HALF_OPEN pour refermer */
  successThreshold: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  openSince: Date | null;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  openTimeoutMs: 30_000,
  successThreshold: 1,
};

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly config: CircuitBreakerConfig;

  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private openSince: Date | null = null;
  private lastFailureAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private totalRequests = 0;
  private totalFailures = 0;

  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(@Optional() config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  onModuleDestroy(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }

  /** État courant */
  get currentState(): CircuitState {
    return this.state;
  }

  get isOpen(): boolean {
    return this.state === 'OPEN';
  }

  /**
   * Exécute une fonction protégée par le circuit breaker.
   * Lève ServiceUnavailableException si le circuit est OUVERT.
   */
  async execute<T>(fn: () => Promise<T>, operationName = 'Ollama'): Promise<T> {
    this.totalRequests++;

    if (this.state === 'OPEN') {
      this.logger.warn(
        `Circuit OUVERT — requête ${operationName} refusée (fast-fail)`,
      );
      throw new ServiceUnavailableException(
        "L'assistant IA est temporairement indisponible. Veuillez réessayer dans quelques instants.",
      );
    }

    try {
      const result = await fn();
      this.onSuccess(operationName);
      return result;
    } catch (err) {
      this.onFailure(
        operationName,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  private onSuccess(operationName: string): void {
    this.lastSuccessAt = new Date();
    this.consecutiveFailures = 0;

    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.close(operationName);
      }
    }
  }

  private onFailure(operationName: string, reason: string): void {
    this.lastFailureAt = new Date();
    this.totalFailures++;
    this.consecutiveSuccesses = 0;

    if (this.state === 'HALF_OPEN') {
      this.logger.warn(
        `Circuit HALF_OPEN — échec sur ${operationName}: ${reason} → réouverture`,
      );
      this.open(operationName);
      return;
    }

    this.consecutiveFailures++;
    this.logger.warn(
      `Circuit CLOSED — échec ${this.consecutiveFailures}/${this.config.failureThreshold} sur ${operationName}: ${reason}`,
    );

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.open(operationName);
    }
  }

  private open(operationName: string): void {
    this.state = 'OPEN';
    this.openSince = new Date();
    this.consecutiveSuccesses = 0;
    this.logger.error(
      `Circuit OUVERT pour ${operationName} — réessai dans ${this.config.openTimeoutMs / 1000}s`,
    );

    // Planifier le passage HALF_OPEN
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.halfOpen(operationName);
    }, this.config.openTimeoutMs);
    // Permet au process Node.js de sortir proprement même si le timer est actif
    this.resetTimer.unref?.();
  }

  private halfOpen(operationName: string): void {
    this.state = 'HALF_OPEN';
    this.consecutiveSuccesses = 0;
    this.logger.log(`Circuit HALF_OPEN — test autorisé pour ${operationName}`);
  }

  private close(operationName: string): void {
    this.state = 'CLOSED';
    this.openSince = null;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.logger.log(`Circuit FERMÉ — ${operationName} de nouveau opérationnel`);
  }

  /** Réinitialisation manuelle (admin) */
  reset(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openSince = null;
    this.logger.log('Circuit réinitialisé manuellement');
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.consecutiveFailures,
      successes: this.consecutiveSuccesses,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      openSince: this.openSince,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }
}
