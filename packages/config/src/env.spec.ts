import { validateApiEnv, EnvValidationError } from './env';

const ok = {
  DATABASE_URL: 'postgresql://u:p@h/db',
  ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('validateApiEnv', () => {
  it('accepte la config minimale et applique les défauts', () => {
    const env = validateApiEnv(ok);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejette une clé invalide sans divulguer sa valeur', () => {
    const bad = { ...ok, ENCRYPTION_KEY: 'secret-trop-court' };
    expect(() => validateApiEnv(bad)).toThrow(EnvValidationError);
    try {
      validateApiEnv(bad);
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-trop-court');
      expect((e as Error).message).toContain('ENCRYPTION_KEY');
    }
  });

  it('exige DATABASE_URL', () => {
    expect(() => validateApiEnv({ ENCRYPTION_KEY: 'a'.repeat(64) })).toThrow();
  });
});

describe('variables vides (docker-compose)', () => {
  it('traite une chaîne vide comme non définie', () => {
    const env = validateApiEnv({
      DATABASE_URL: 'postgresql://u:p@h/db',
      ENCRYPTION_KEY: 'a'.repeat(64),
      LDAP_URL: '',
      COOKIE_SECURE: '',
    });
    expect(env.LDAP_URL).toBeUndefined();
    expect(env.COOKIE_SECURE).toBeUndefined();
  });
});
