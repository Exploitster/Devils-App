import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
function derive(secret: string): Buffer { return Buffer.from(hkdfSync('sha256', secret, 'devils-advocate', 'user-model-key/v1', 32)); }

/**
 * AES-256-GCM under a key derived from the server secret. `context` names the account and
 * provider, so a stored value cannot be moved to another account's row and still open.
 */
export function sealKey(plain: string, secret: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(secret), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** Null when the value was sealed under another secret or account, or was altered. */
export function openKey(sealed: string, secret: string, context: string): string | null {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(secret), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
