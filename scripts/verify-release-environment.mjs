// Non-secret deployment identities are deliberately pinned. Never copy the live
// database credentials into testing to make this check pass.
const productionProject = 'prj_RtFOuKfu3erBBiaiU7uIuvGPndEt';
const productionDatabase = 'fttulbecvnxlutpqjrky.supabase.co';
const productionOrigin = 'https://www.devils-advocate.app';
function blocked() {
  throw new Error('RELEASE_ENVIRONMENT_BLOCKED: configure separate staging/production project, database and site URL; payments must remain disabled.');
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
if (!['staging', 'production'].includes(role) || !env.VERCEL_PROJECT_ID?.startsWith('prj_') || env.DEVILS_PAYMENTS_ENABLED !== 'false') blocked();
const database = origin(env.DEVILS_SUPABASE_URL);
const app = origin(env.DEVILS_APP_URL);
if (database.port || !/^[a-z0-9]{20}\.supabase\.co$/.test(database.hostname)) blocked();
if (role === 'production') {
  if (env.VERCEL_PROJECT_ID !== productionProject || database.hostname !== productionDatabase || app.origin !== productionOrigin) blocked();
} else {
  if (env.VERCEL_PROJECT_ID === productionProject || database.hostname === productionDatabase || app.port || app.hostname === 'devils-advocate.app' || app.hostname === 'www.devils-advocate.app') blocked();
}
console.log(`Deployment isolation: ${role} project, database and origin verified; payments disabled.`);
