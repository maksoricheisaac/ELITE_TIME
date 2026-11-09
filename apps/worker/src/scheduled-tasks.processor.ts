import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { SCHEDULED_QUEUE, TASKS } from './queues';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { WorkerMetrics } from './metrics.service';

@Processor(SCHEDULED_QUEUE, { concurrency: 1 })
export class ScheduledTasksProcessor extends WorkerHost {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly tasks: ScheduledTasksService,
    private readonly metrics: WorkerMetrics,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case TASKS.EXIT_REMINDER:
        return this.tasks.exitReminder();
      case TASKS.AUTO_CLOSE:
        return this.tasks.autoCloseCheck();
      case TASKS.EMAIL_POLL:
        return this.tasks.emailPoll();
      case TASKS.RESOLVE_INCOMPLETE:
        return this.tasks.resolveIncomplete();
      case TASKS.LDAP_SYNC:
        return this.tasks.ldapSyncTask();
      default:
        throw new Error(`Tâche inconnue : ${job.name}`);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: unknown) {
    this.metrics.record(job.name, 'completed');
    this.logger.debug(`${job.name} terminé ${JSON.stringify(result ?? null)}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    this.metrics.record(job?.name ?? 'unknown', 'failed');
    this.logger.error(
      `${job?.name ?? '?'} échoué (tentative ${job?.attemptsMade ?? '?'}) : ${err.message}`,
    );
  }
}
