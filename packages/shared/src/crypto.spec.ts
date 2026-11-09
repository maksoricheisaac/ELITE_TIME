import { encrypt, decrypt } from './crypto';

// Fixture produite par l'implémentation d'origine (apps/api/src/lib/crypto.ts)
// avant extraction : garantit que les données déjà chiffrées restent lisibles.
const KEY = 'ab'.repeat(32);
const PLAIN = 'Jean Dupont é€';
const LEGACY_CIPHER =
  '2DCeduj9xGFzWTrmz3TJmcYSiCgeOdG6mt+lU3cj7eCesf6iGkdxcu0UXzzx';

describe('crypto AES-256-GCM', () => {
  const prev = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });
  afterAll(() => {
    process.env.ENCRYPTION_KEY = prev;
  });

  it("déchiffre une valeur chiffrée par l'implémentation historique", () => {
    expect(decrypt(LEGACY_CIPHER)).toBe(PLAIN);
  });

  it('chiffre puis déchiffre (aller-retour)', () => {
    const c = encrypt(PLAIN);
    expect(c).not.toBe(PLAIN);
    expect(decrypt(c)).toBe(PLAIN);
  });

  it('ne chiffre pas deux fois de la même façon (IV aléatoire)', () => {
    expect(encrypt(PLAIN)).not.toBe(encrypt(PLAIN));
  });

  it('refuse une clé de longueur invalide', () => {
    process.env.ENCRYPTION_KEY = 'abcd';
    expect(() => encrypt('x')).toThrow();
    process.env.ENCRYPTION_KEY = KEY;
  });
});
