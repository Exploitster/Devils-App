import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RuntimeConfig } from '../config';

/** A service-role client. Server-only. */
export function createAdminClient(config: Pick<RuntimeConfig, 'supabaseUrl' | 'supabaseServiceRoleKey'>): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
