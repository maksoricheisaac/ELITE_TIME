import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined');
  }
  if (encryptionKey.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY doit faire 64 caractères hex (32 bytes). Actuelle: ${encryptionKey.length}`,
    );
  }
  return Buffer.from(encryptionKey, 'hex');
}

export function encrypt(value: string): string {
  if (!value) return value;

  try {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  } catch (error) {
    console.error('[Crypto] Encryption error:', error);
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export function decrypt(value: string): string {
  if (!value) return value;

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error(
      '[Crypto] ENCRYPTION_KEY environment variable is not defined',
    );
    return '';
  }

  try {
    const buffer = Buffer.from(value, 'base64');

    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return value;
    }

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = getKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    try {
      decipher.setAuthTag(authTag);
    } catch {
      return value;
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (
      errorMessage.includes(
        'Unsupported state or unable to authenticate data',
      ) ||
      errorMessage.includes('invalid padding') ||
      errorMessage.includes('auth tag') ||
      (error as NodeJS.ErrnoException).code === 'ERR_CRYPTO_INVALID_AUTH_TAG'
    ) {
      return value;
    }
    console.error('[Crypto] Decryption error:', error);
    return '';
  }
}
