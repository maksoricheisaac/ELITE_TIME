import { ToolResultCache } from '../cache/tool-result.cache.js';

const USER_CTX = { userId: 'user-1', role: 'employee', department: 'IT' };
const MANAGER_CTX = { userId: 'user-2', role: 'manager', department: 'IT' };
const TEAM_LEAD_CTX = { userId: 'user-3', role: 'team_lead', department: 'IT' };

const OK_RESULT = { success: true, data: { test: true } };
const ERR_RESULT = { success: false, error: 'Test error' };

describe('ToolResultCache', () => {
  let cache: ToolResultCache;

  beforeEach(() => {
    cache = new ToolResultCache();
  });

  afterEach(() => {
    cache.onModuleDestroy();
  });

  describe('opérations de base', () => {
    it('retourne null si clé absente', () => {
      const key = cache.buildKey('get_my_hours', { period: 'week' }, USER_CTX);
      expect(cache.get(key)).toBeNull();
    });

    it('stocke et récupère une entrée', () => {
      const key = cache.buildKey('get_my_hours', { period: 'week' }, USER_CTX);
      cache.set(key, OK_RESULT, 'get_my_hours');
      expect(cache.get(key)).toEqual(OK_RESULT);
    });

    it('les stats comptent les hits et misses', () => {
      const key = cache.buildKey('get_my_hours', {}, USER_CTX);
      cache.get(key); // miss
      cache.set(key, OK_RESULT, 'get_my_hours');
      cache.get(key); // hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('scoping par rôle/utilisateur', () => {
    it('outils personnels : clé différente par userId', () => {
      const key1 = cache.buildKey('get_my_hours', { period: 'week' }, USER_CTX);
      const key2 = cache.buildKey(
        'get_my_hours',
        { period: 'week' },
        MANAGER_CTX,
      );
      expect(key1).not.toBe(key2);
      expect(key1).toContain('user-1');
      expect(key2).toContain('user-2');
    });

    it('outils équipe : clé partagée par rôle (manager)', () => {
      const key1 = cache.buildKey('get_absent_today', {}, MANAGER_CTX);
      const key2 = cache.buildKey(
        'get_absent_today',
        {},
        { userId: 'other-manager', role: 'manager', department: 'IT' },
      );
      expect(key1).toBe(key2);
    });

    it('outils équipe : team_lead a une clé par département', () => {
      const key1 = cache.buildKey('get_absent_today', {}, TEAM_LEAD_CTX);
      const key2 = cache.buildKey(
        'get_absent_today',
        {},
        { ...TEAM_LEAD_CTX, department: 'RH' },
      );
      expect(key1).not.toBe(key2);
      expect(key1).toContain('dept:IT');
      expect(key2).toContain('dept:RH');
    });
  });

  describe('invalidation', () => {
    it("invalidate supprime les entrées d'un outil", () => {
      const key = cache.buildKey('get_absent_today', {}, MANAGER_CTX);
      cache.set(key, OK_RESULT, 'get_absent_today');
      expect(cache.get(key)).not.toBeNull();

      cache.invalidateTool('get_absent_today');
      expect(cache.get(key)).toBeNull();
    });

    it('flush vide tout le cache', () => {
      const key1 = cache.buildKey('get_my_hours', { period: 'week' }, USER_CTX);
      const key2 = cache.buildKey('get_absent_today', {}, MANAGER_CTX);
      cache.set(key1, OK_RESULT, 'get_my_hours');
      cache.set(key2, OK_RESULT, 'get_absent_today');

      cache.flush();
      expect(cache.getStats().entries).toBe(0);
    });
  });

  describe('args différents → clés différentes', () => {
    it('period=week vs period=month = clés différentes', () => {
      const k1 = cache.buildKey('get_my_hours', { period: 'week' }, USER_CTX);
      const k2 = cache.buildKey('get_my_hours', { period: 'month' }, USER_CTX);
      expect(k1).not.toBe(k2);
    });

    it("pas d'args vs args vides = même clé", () => {
      const k1 = cache.buildKey('get_department_statistics', {}, MANAGER_CTX);
      const k2 = cache.buildKey('get_department_statistics', {}, MANAGER_CTX);
      expect(k1).toBe(k2);
    });
  });

  describe('résultats en erreur non cachés', () => {
    it('un résultat success=false peut être mis en cache si explicitement demandé', () => {
      const key = cache.buildKey('get_my_hours', {}, USER_CTX);
      cache.set(key, ERR_RESULT, 'get_my_hours');
      expect(cache.get(key)).toEqual(ERR_RESULT);
    });
  });
});
