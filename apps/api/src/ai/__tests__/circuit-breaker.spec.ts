import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service.js';

describe('CircuitBreakerService', () => {
  let cb: CircuitBreakerService;

  beforeEach(() => {
    cb = new CircuitBreakerService({
      failureThreshold: 3,
      openTimeoutMs: 100, // Court pour les tests
      successThreshold: 1,
    });
  });

  afterEach(() => {
    cb.onModuleDestroy();
  });

  describe('état initial CLOSED', () => {
    it('laisse passer les requêtes en CLOSED', async () => {
      const result = await cb.execute(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('state initial est CLOSED', () => {
      expect(cb.currentState).toBe('CLOSED');
    });
  });

  describe('passage CLOSED → OPEN', () => {
    async function failN(n: number) {
      for (let i = 0; i < n; i++) {
        await cb
          .execute(() => Promise.reject(new Error('test fail')))
          .catch(() => void 0);
      }
    }

    it('reste CLOSED après 2 échecs (< seuil)', async () => {
      await failN(2);
      expect(cb.currentState).toBe('CLOSED');
    });

    it('passe OPEN après 3 échecs consécutifs', async () => {
      await failN(3);
      expect(cb.currentState).toBe('OPEN');
    });

    it('fast-fail en OPEN — lance ServiceUnavailableException', async () => {
      await failN(3);
      await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('passage OPEN → HALF_OPEN → CLOSED', () => {
    it('passe HALF_OPEN après le timeout', async () => {
      for (let i = 0; i < 3; i++) {
        await cb
          .execute(() => Promise.reject(new Error('fail')))
          .catch(() => void 0);
      }
      expect(cb.currentState).toBe('OPEN');

      await new Promise((r) => setTimeout(r, 150)); // Attendre openTimeoutMs = 100ms
      expect(cb.currentState).toBe('HALF_OPEN');
    });

    it('ferme le circuit après succès en HALF_OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        await cb
          .execute(() => Promise.reject(new Error('fail')))
          .catch(() => void 0);
      }
      await new Promise((r) => setTimeout(r, 150));
      expect(cb.currentState).toBe('HALF_OPEN');

      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.currentState).toBe('CLOSED');
    });

    it('réouvre si nouvel échec en HALF_OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        await cb
          .execute(() => Promise.reject(new Error('fail')))
          .catch(() => void 0);
      }
      await new Promise((r) => setTimeout(r, 150));
      await cb
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => void 0);
      expect(cb.currentState).toBe('OPEN');
    });
  });

  describe('reset manuel', () => {
    it('réinitialise le circuit', async () => {
      for (let i = 0; i < 3; i++) {
        await cb
          .execute(() => Promise.reject(new Error('fail')))
          .catch(() => void 0);
      }
      expect(cb.currentState).toBe('OPEN');
      cb.reset();
      expect(cb.currentState).toBe('CLOSED');
    });
  });

  describe('statistiques', () => {
    it('retourne des stats correctes', async () => {
      await cb.execute(() => Promise.resolve('ok'));
      const stats = cb.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalFailures).toBe(0);
    });
  });
});
