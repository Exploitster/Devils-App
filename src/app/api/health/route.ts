import { readConfig } from '../../../lib/config';
import { json } from '../../../lib/http';
export const runtime='nodejs';
/** Configuration readiness only; this endpoint does not attest remote service connectivity. */
export async function GET(){try{const config=readConfig();return json({status:'ok',runtimeMode:config.mode,configured:true});}catch{return json({status:'unconfigured',configured:false},503);}}
