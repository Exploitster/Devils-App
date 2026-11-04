import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
// Read-only deployment preflight. No email, user creation or conversation reads.
const url = process.env.DEVILS_SUPABASE_URL;
const anon = process.env.DEVILS_SUPABASE_ANON_KEY;
const service = process.env.DEVILS_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error('AUTH_CONFIGURATION_MISSING');
const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error('AUTH_SETTINGS_UNAVAILABLE');
const settings = await response.json();
console.log('Public authentication readiness:', JSON.stringify({ google: settings.external?.google === true, email: settings.external?.email === true, signup: settings.disable_signup === false, emailConfirmation: settings.mailer_autoconfirm !== true }));
if (settings.disable_signup === true || settings.external?.email !== true) throw new Error('ENABLE_PUBLIC_EMAIL_SIGNUP_IN_SUPABASE');
if (settings.external?.google !== true) console.warn('Google sign-in requires its Supabase provider configuration before it can be verified.');
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const table = await admin.from('profiles').select('user_id').limit(0);
if (table.error) throw new Error('PROFILE_STORAGE_UNAVAILABLE');
const rpc = await admin.rpc('app_store', { p_method: 'getProfile', p_args: { userId: randomUUID() }, p_owner: null });
if (rpc.error) throw new Error('APPLICATION_STORE_RPC_UNAVAILABLE');
console.log('Hosted profile storage and application RPC: verified without reading existing user records.');
