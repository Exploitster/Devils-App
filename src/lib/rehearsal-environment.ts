// This exception is for the owner's explicitly approved temporary rehearsal.
// Isolated staging still requires a separate project and database.
export const productionProject = 'prj_RtFOuKfu3erBBiaiU7uIuvGPndEt';
export const productionDatabase = 'fttulbecvnxlutpqjrky.supabase.co';
export const productionOrigin = 'https://www.devils-advocate.app';
export const rehearsalOrigin = 'https://devils-advocate-preview-exploitster1.vercel.app';
export function sharedDataRehearsal(env:Record<string,string|undefined>):boolean {
  if(env.DEVILS_DEPLOYMENT_ENV!=='rehearsal')return false;
  const ids=(env.DEVILS_DODO_TEST_USER_IDS??'').split(',').map(value=>value.trim());
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(env.DEVILS_SHARED_DATA_REHEARSAL!=='true'||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!==productionProject||env.DEVILS_SUPABASE_URL!==`https://${productionDatabase}`||env.DEVILS_APP_URL!==rehearsalOrigin||env.DEVILS_PAYMENTS_ENABLED!=='false'||env.DEVILS_BILLING_PROVIDER!=='dodo'||env.DEVILS_DODO_ENVIRONMENT!=='test_mode'||!ids.length||ids.some(id=>!uuid.test(id)))throw new Error('REHEARSAL_ENVIRONMENT_BLOCKED: use the fixed preview address, shared-data acknowledgement, Dodo test mode and valid test-account UUIDs; paid collection must stay disabled.');
  return true;
}
