import { Injectable, Logger } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Sémaphore pour limiter la concurrence des requêtes vers Ollama.
 * Empêche la surcharge CPU/RAM sur le serveur LLM local.
 */
@Injectable()
export class AiRequestQueue {
  private readonly logger = new Logger(AiRequestQueue.name);

  /** Requêtes Ollama actives en parallèle */
  private readonly maxConcurrent = 3;
  /** Taille max de la file d'attente */
  private readonly maxQueueSize = 10;
  /** Timeout d'attente dans la queue (ms) */
  private readonly queueTimeoutMs = 30_000;

  private active = 0;
  private queued = 0;
  private totalProcessed = 0;
  private totalRejected = 0;

  private readonly waiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  /**
   * Exécute une tâche en respectant les limites de concurrence.
   * Attend en queue si toutes les slots sont occupées.
   * Rejette si la queue est pleine.
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const result = await task();
      this.totalProcessed++;
      return result;
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }

    if (this.queued >= this.maxQueueSize) {
      this.totalRejected++;
      this.logger.warn(
        `Queue IA pleine (${this.maxQueueSize}) — requête rejetée. Active: ${this.active}`,
      );
      return Promise.reject(
        new ServiceUnavailableException(
          "L'assistant IA est surchargé. Veuillez réessayer dans quelques instants.",
        ),
      );
    }

    this.queued++;
    this.logger.debug(
      `Requête mise en file (${this.queued}/${this.maxQueueSize}). Active: ${this.active}`,
    );

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
          this.queued--;
          this.totalRejected++;
        }
        reject(
          new ServiceUnavailableException(
            "Délai d'attente dépassé. Veuillez réessayer.",
          ),
        );
      }, this.queueTimeoutMs);
      timer.unref?.();

      this.waiters.push({ resolve, reject, timer });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);

    const next = this.waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      this.queued--;
      this.active++;
      next.resolve();
    }
  }

  getStats() {
    return {
      active: this.active,
      queued: this.queued,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      totalProcessed: this.totalProcessed,
      totalRejected: this.totalRejected,
      utilizationRate:
        this.maxConcurrent > 0
          ? `${Math.round((this.active / this.maxConcurrent) * 100)}%`
          : '0%',
    };
  }
}
