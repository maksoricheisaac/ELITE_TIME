import { AiRequestQueue } from '../queue/ai-request.queue.js';

describe('AiRequestQueue', () => {
  let queue: AiRequestQueue;

  beforeEach(() => {
    queue = new AiRequestQueue();
  });

  describe('exécution normale', () => {
    it('exécute une tâche directement', async () => {
      const result = await queue.run(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('exécute plusieurs tâches sans conflit', async () => {
      const results = await Promise.all([
        queue.run(() => Promise.resolve(1)),
        queue.run(() => Promise.resolve(2)),
        queue.run(() => Promise.resolve(3)),
      ]);
      expect(results).toEqual([1, 2, 3]);
    });

    it('propage les erreurs de la tâche', async () => {
      await expect(
        queue.run(() => Promise.reject(new Error('task error'))),
      ).rejects.toThrow('task error');
    });
  });

  describe('statistiques', () => {
    it('compte les tâches traitées', async () => {
      await queue.run(() => Promise.resolve('ok'));
      await queue.run(() => Promise.resolve('ok2'));
      const stats = queue.getStats();
      expect(stats.totalProcessed).toBe(2);
      expect(stats.active).toBe(0);
      expect(stats.queued).toBe(0);
    });

    it("retourne le taux d'utilisation", () => {
      const stats = queue.getStats();
      expect(stats.utilizationRate).toBe('0%');
      expect(stats.maxConcurrent).toBe(3);
    });
  });

  describe("file d'attente avec concurrence", () => {
    it('exécute les tâches séquentiellement quand slot = 1 (simulation)', async () => {
      // Créer une queue custom via hack (modify private)
      const q = new AiRequestQueue();
      (q as unknown as { maxConcurrent: number }).maxConcurrent = 1;
      const order: number[] = [];

      const tasks = [
        q.run(async () => {
          await new Promise((r) => setTimeout(r, 20));
          order.push(1);
          return 1;
        }),
        q.run(() => {
          order.push(2);
          return Promise.resolve(2);
        }),
      ];

      await Promise.all(tasks);
      expect(order[0]).toBe(1);
      expect(order[1]).toBe(2);
    });
  });
});
