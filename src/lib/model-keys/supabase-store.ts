import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { ownAiUnavailable, type ModelKeyStore, type StoredModelKey } from './store';

// PostgREST reports an unknown table as PGRST205; PostgreSQL itself as 42P01.
const missingTable = new Set(['PGRST205', '42P01']);
const unavailable = () => new AppError('STORE_UNAVAILABLE', 'Storage is temporarily unavailable.', 503);

/** Uses the service-role client: the table has no policies for signed-in users. */
export class SupabaseModelKeyStore implements ModelKeyStore {
  constructor(private admin: SupabaseClient) {}
  async get(userId: string) {
    const { data, error } = await this.admin.from('user_model_keys').select('data').eq('user_id', userId).maybeSingle();
    // Before migration 006 nobody can have a key, so conversations carry on with the app's AI.
    if (error) { if (missingTable.has(error.code ?? '')) return null; throw unavailable(); }
    return (data?.data as StoredModelKey | undefined) ?? null;
  }
  async put(record: StoredModelKey) {
    const { error } = await this.admin.from('user_model_keys').upsert({ user_id: record.userId, data: record, updated_at: record.updatedAt });
    if (error) throw missingTable.has(error.code ?? '') ? ownAiUnavailable() : unavailable();
  }
  async delete(userId: string) {
    const { error } = await this.admin.from('user_model_keys').delete().eq('user_id', userId);
    if (error && !missingTable.has(error.code ?? '')) throw unavailable();
  }
}
