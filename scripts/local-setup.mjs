import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
const path = '.env.local';
const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
if (/^\s*DEVILS_LOCAL_AUTH_SECRET\s*=/m.test(existing)) {
  console.log('Existing local signing configuration preserved.');
} else {
  const line = `${existing && !existing.endsWith('\n') ? '\n' : ''}DEVILS_LOCAL_AUTH_SECRET=${randomBytes(32).toString('hex')}\n`;
  if (existsSync(path)) appendFileSync(path, line);
  else writeFileSync(path, line, { mode: 0o600, flag: 'wx' });
  console.log('Local signing configuration saved to ignored .env.local.');
}
