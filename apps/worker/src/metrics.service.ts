import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { SCHEDULED_QUEUE } from './queues';

type Outcome = 'completed' | 'failed';

/** Compteurs du worker + état de la file, au format texte Prometheus. */
@Injectable()
export class WorkerMetrics {
  private readonly counts = new Map<string, number>();
  private readonly startedAt = Date.now();

  constructor(@InjectQueue(SCHEDULED_QUEUE) private readonly queue: Queue) {}

  record(task: string, outcome: Outcome) {
    const key = `${task}|${outcome}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  async render(): Promise<string> {
    const lines: string[] = [
      '# HELP elitetime_worker_uptime_seconds Durée de vie du processus worker',
      '# TYPE elitetime_worker_uptime_seconds gauge',
      `elitetime_worker_uptime_seconds ${Math.round((Date.now() - this.startedAt) / 1000)}`,
      '# HELP elitetime_worker_jobs_total Jobs traités depuis le démarrage',
      '# TYPE elitetime_worker_jobs_total counter',
    ];
    for (const [key, n] of this.counts) {
      const [task, outcome] = key.split('|');
      lines.push(
        `elitetime_worker_jobs_total{task="${task}",outcome="${outcome}"} ${n}`,
      );
    }
    lines.push(
      '# HELP elitetime_queue_jobs Jobs dans la file par état',
      '# TYPE elitetime_queue_jobs gauge',
    );
    try {
      const c = await this.queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
      );
      for (const [state, n] of Object.entries(c)) {
        lines.push(`elitetime_queue_jobs{queue="${SCHEDULED_QUEUE}",state="${state}"} ${n}`);
      }
    } catch {
      lines.push('# queue counts indisponibles (Redis)');
    }
    return lines.join('\n') + '\n';
  }
}
