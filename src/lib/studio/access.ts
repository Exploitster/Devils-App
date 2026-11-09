import type { Identity } from '../contracts';
import type { RuntimeConfig } from '../config';
import { getIdentity, getRuntimeConfig } from '../auth/service';
import { AppError, notFound } from '../errors';

/** The owner is a confirmed email on the server-only allowlist. */
export function isOwner(identity: Identity, config: RuntimeConfig): boolean {
  return identity.emailConfirmed === true && config.ownerEmails.includes(identity.email.trim().toLowerCase());
}
/** Anyone who is not the owner, signed in or not, gets the same not-found error as a missing page. */
export async function requireOwner(request: Request): Promise<Identity> {
  const user = await getIdentity(request);
  if (!user || !isOwner(user, getRuntimeConfig(request))) throw notFound();
  return user;
}
/** The shared-data rehearsal site may show the Studio but never change it. */
export function assertStudioWritable(config: RuntimeConfig): void {
  if (config.sharedDataRehearsal) throw new AppError('STUDIO_READ_ONLY', 'The Studio is read-only on the test site.', 403);
}
