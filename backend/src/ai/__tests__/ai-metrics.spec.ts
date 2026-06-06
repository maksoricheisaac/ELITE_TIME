import { AiMetricsService } from '../metrics/ai-metrics.service.js';
import type { AiRequestRecord } from '../metrics/ai-metrics.service.js';

function makeRecord(overrides: Partial<AiRequestRecord> = {}): AiRequestRecord {
  return {
    userId: 'user-1',
    role: 'employee',
    durationMs: 500,
    toolsUsed: [],
    streaming: false,
    isError: false,
    errorType: null,
    cacheHits: 0,
    timestamp: new Date(),
    ...overrides,
  };
}

describe('AiMetricsService', () => {
  let service: AiMetricsService;

  beforeEach(() => {
    service = new AiMetricsService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('getSummary — état vide', () => {
    it('retourne des valeurs zéro pour un service neuf', () => {
      const s = service.getSummary();
      expect(s.totalRequests).toBe(0);
      expect(s.totalErrors).toBe(0);
      expect(s.errorRate).toBe('0%');
      expect(s.averageLatencyMs).toBe(0);
    });
  });

  describe('enregistrement et comptage', () => {
    it('compte les requêtes correctement', () => {
      service.record(makeRecord());
      service.record(makeRecord());
      expect(service.getSummary().totalRequests).toBe(2);
    });

    it('compte les erreurs', () => {
      service.record(makeRecord({ isError: false }));
      service.record(
        makeRecord({ isError: true, errorType: 'OllamaUnavailable' }),
      );
      const s = service.getSummary();
      expect(s.totalErrors).toBe(1);
      expect(s.errorRate).toBe('50.0%');
    });

    it('calcule la latence moyenne correctement', () => {
      service.record(makeRecord({ durationMs: 200 }));
      service.record(makeRecord({ durationMs: 400 }));
      service.record(makeRecord({ durationMs: 600 }));
      expect(service.getSummary().averageLatencyMs).toBe(400);
    });
  });

  describe('comptage des outils', () => {
    it('compte les outils utilisés', () => {
      service.record(
        makeRecord({ toolsUsed: ['get_my_hours', 'get_absent_today'] }),
      );
      service.record(makeRecord({ toolsUsed: ['get_my_hours'] }));
      const s = service.getSummary();
      const topTools = s.topTools;
      const myHours = topTools.find((t) => t.name === 'get_my_hours');
      expect(myHours?.count).toBe(2);
    });
  });

  describe('utilisateurs actifs', () => {
    it('compte les utilisateurs uniques', () => {
      service.record(makeRecord({ userId: 'user-1' }));
      service.record(makeRecord({ userId: 'user-1' }));
      service.record(makeRecord({ userId: 'user-2' }));
      expect(service.getSummary().activeUsers).toBe(2);
    });
  });

  describe('streaming', () => {
    it('compte les requêtes streaming', () => {
      service.record(makeRecord({ streaming: false }));
      service.record(makeRecord({ streaming: true }));
      expect(service.getSummary().streamingRequests).toBe(1);
    });
  });

  describe('erreurs récentes', () => {
    it('retourne les erreurs les plus récentes', () => {
      service.record(makeRecord({ isError: false }));
      service.record(
        makeRecord({ isError: true, errorType: 'OllamaUnavailable' }),
      );
      const errors = service.getRecentErrors(10);
      expect(errors).toHaveLength(1);
      expect(errors[0].errorType).toBe('OllamaUnavailable');
    });
  });
});
