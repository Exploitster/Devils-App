// Deployment identities are pinned. Isolated staging must use a separate database.
// Only the owner-approved, explicitly labeled preview rehearsal shares accounts.
import {productionProject,productionDatabase,productionOrigin,sharedDataRehearsal} from '../src/lib/rehearsal-environment.ts';
function blocked() {
  throw new Error('RELEASE_ENVIRONMENT_BLOCKED: configure separate staging/production project, database and site URL; payments stay disabled except in production with live Dodo and a past DEVILS_PAID_ACCESS_START.');
}
function origin(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') blocked();
    return parsed;
  } catch { blocked(); }
}
const env = process.env;
const role = env.DEVILS_DEPLOYMENT_ENV;
const livePayments = role === 'production' && env.DEVILS_PAYMENTS_ENABLED === 'true' && env.DEVILS_BILLING_PROVIDER === 'dodo' && env.DEVILS_DODO_ENVIRONMENT === 'live_mode' && /(Z|[+-]\d{2}:\d{2})$/.test(env.DEVILS_PAID_ACCESS_START ?? '') && Date.parse(env.DEVILS_PAID_ACCESS_START) <= Date.now();
if (!['staging', 'production','rehearsal'].includes(role) || !env.VERCEL_PROJECT_ID?.startsWith('prj_') || (env.DEVILS_PAYMENTS_ENABLED !== 'false' && !livePayments)) blocked();
const database = origin(env.DEVILS_SUPABASE_URL);
const app = origin(env.DEVILS_APP_URL);
if (database.port || !/^[a-z0-9]{20}\.supabase\.co$/.test(database.hostname)) blocked();
if(role==='rehearsal'){
  try{sharedDataRehearsal(env);}catch{blocked();}
  console.log('Temporary rehearsal: shared production accounts and data; Dodo test payments only; paid collection disabled.');
}else if (role === 'production') {
  if (env.VERCEL_PROJECT_ID !== productionProject || database.hostname !== productionDatabase || app.origin !== productionOrigin) blocked();
} else {
  if (env.VERCEL_PROJECT_ID === productionProject || database.hostname === productionDatabase || app.port || app.hostname === 'devils-advocate.app' || app.hostname === 'www.devils-advocate.app') blocked();
}
if(role!=='rehearsal')console.log(`Deployment isolation: ${role} project, database and origin verified; ${livePayments ? 'live payments enabled for new accounts' : 'payments disabled'}.`);
