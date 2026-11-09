import { Inject, Injectable } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type IORedis from 'ioredis';
import { REDIS } from './redis.provider';

/**
 * Émet des événements Socket.IO depuis un autre processus que l'API, via
 * l'adaptateur Redis (l'API les relaie aux clients connectés).
 * Mêmes rooms et mêmes noms d'événements que WebsocketGateway.
 */
@Injectable()
export class RealtimeService {
  private readonly emitter: Emitter;

  constructor(@Inject(REDIS) redis: IORedis) {
    this.emitter = new Emitter(redis);
  }

  broadcastExitReminder(payload: {
    userId: string;
    message: string;
    timestamp: string;
  }) {
    this.emitter
      .to(`user-${payload.userId}`)
      .emit('employee_pointage_exit_reminder', payload);
  }
}
