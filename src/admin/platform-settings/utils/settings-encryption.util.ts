import * as crypto from 'crypto';

/* ============================================================================
 * SETTINGS ENCRYPTION (DEV-024)
 * ----------------------------------------------------------------------------
 * Encrypts integration secrets (Stripe/PayPal/Twilio/SendGrid keys) before
 * they're persisted in platform_settings.integrations (jsonb), and decrypts
 * them only when the server genuinely needs the plaintext. Nothing decrypted
 * should ever be sent back over the API — the maskSecret() is below, used by
 * PlatformSettingsService.getIntegrations().
 *
 * The Alogotithm pattern i am going to use is ALGORITHM: AES-256-GCM
 *   - 256-bit key, read from SETTINGS_ENCRYPTION_KEY (base64, 32 bytes).
 *   - Random 12-byte IV per encryption call (never reused).
 *   - GCM auth tag stored alongside ciphertext, so any tampering with the
 *     stored value causes decrypt() to throw rather than silently return
 *     corrupted/garbage plaintext.
 *
 * STORAGE FORMAT: "<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 * ==========================================================================*/

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

let cachedKey: Buffer | null = null;

/**
 * Reads and validates SETTINGS_ENCRYPTION_KEY once, then caches it.
 * Throws on startup (first use) if the key is missing or the wrong length —
 * we want this to fail loudly and immediately, not silently encrypt with
 * garbage or crash later on a random admin request.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is not set. Generate one with ' +
        '`openssl rand -base64 32` and set it in your environment before ' +
        'platform-settings integration secrets can be encrypted or decrypted.',
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `SETTINGS_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes ` +
        `(got ${key.length}). Generate one with \`openssl rand -base64 32\`.`,
    );
  }

  cachedKey = key;
  return cachedKey;
}

/** Encrypts a plaintext secret. Returns the combined iv:authTag:ciphertext string. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Decrypts a value produced by encrypt(). Throws if the value is malformed or tampered with. */
export function decrypt(stored: string): string {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Malformed encrypted value: expected "iv:authTag:ciphertext".',
    );
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

/**
 * Masks a secret for API responses — keeps only the last 4 characters visible.
 * Empty/short values are masked in full rather than throwing, since the admin
 * UI needs a safe value to render either way.
 */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return '•'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * True if a value looks like something maskSecret() produced, i.e. the admin
 * UI echoed back the masked placeholder unchanged rather than the user
 * actually typing a new key. Used by updateIntegrations() to avoid re-
 * encrypting a masked placeholder as if it were a real new secret.
 */
export function looksMasked(value: string): boolean {
  return value.startsWith('•');
}
