import type { Identity } from '../contracts';
import type { RuntimeConfig } from '../config';
import { getIdentity, getRuntimeConfig } from '../auth/service';
import { AppError, notFound } from '../errors';
import { sameOrigin } from '../http';

export function isOwner(identity: Identity, config: RuntimeConfig): boolean {
  return identity.emailConfirmed === true && config.ownerEmails.includes(identity.email.trim().toLowerCase());
}
/** Anyone who is not the owner, signed in or not, gets the same not-found error as a missing page. */
export async function requireOwner(request: Request): Promise<Identity> {
  const user = await getIdentity(request);
  if (!user || !isOwner(user, getRuntimeConfig(request))) throw notFound();
  return user;
}
export function assertStudioWritable(config: RuntimeConfig): void {
  if (config.sharedDataRehearsal) throw new AppError('STUDIO_READ_ONLY', 'The Studio is read-only on the test site.', 403);
}
/** Only the owner gets past here; writes also need a same-origin request outside the rehearsal site. */
export async function authorizeStudio(request: Request, options: { write: boolean }): Promise<{ owner: Identity; config: RuntimeConfig }> {
  const owner = await requireOwner(request); const config = getRuntimeConfig(request);
  if (options.write) { sameOrigin(request, config.appUrl); assertStudioWritable(config); }
  return { owner, config };
}
