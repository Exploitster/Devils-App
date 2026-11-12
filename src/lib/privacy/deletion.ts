import type { Store } from '../contracts';
import { AppError } from '../errors';
export interface DeletionDependencies {store:Store;cancelRenewal:(userId:string)=>Promise<void>;deleteIdentity:(userId:string)=>Promise<void>;/** Removes the person's own AI key, when that feature is in use. */removeOwnAiKey?:(userId:string)=>Promise<void>;}
/** The authenticated caller supplies the identity, never a submitted account ID. */
export async function deleteAccount(userId:string,{store,cancelRenewal,deleteIdentity,removeOwnAiKey}:DeletionDependencies):Promise<void> {
 await store.beginAccountDeletion(userId);
 try {
  // Provider state can exist before a webhook has written a subscription row.
  await cancelRenewal(userId);
  await removeOwnAiKey?.(userId);
  await store.deleteAccountData(userId);
  await deleteIdentity(userId);
 } catch {
  // Private content may already be gone. Keep the verified identity usable only for retry.
  await store.beginAccountDeletion(userId);
  throw new AppError('DELETION_PENDING','Your account is disabled. Account closure is waiting for a service; retry deletion to finish.',503);
 }
}
export const privacyDisclosure={
 storage:'Conversations, messages, summaries, cards and usage are stored with access controls. They are not end-to-end encrypted.',
 model:'Bounded conversation context, selected evidence and private guidance from the app’s owner are sent to the model provider. Provider routing, retention and training policies depend on the configured AI service and account. If you connect your own Claude or OpenAI key, your conversations are sent to that provider under your own account and its terms, and your key is stored encrypted.',
 retention:'Private conversations remain until you delete them. Shared public evidence is retained. Provider billing records, pseudonymous billing links and aggregate provider-attempt spend remain for accounting and abuse controls. Backups may retain deleted data until their retention window expires; no immediate backup erasure is promised.',
 deletion:'Deleting a conversation removes its saved messages, cards, summary, operations and usage. Account deletion disables access and pending writes, stops renewal, removes private content, any AI key you connected and the authentication identity. Service failures leave closure pending and retryable. No payment is required to request deletion. Unresolved checkouts or provider failures can keep closure pending until future charges can be ruled out.',
} as const;
