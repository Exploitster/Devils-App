import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';
import type { Session } from '../src/lib/contracts';
import { returnRate, type SessionSummary } from '../src/lib/case-prep/return-rate';

try { process.loadEnvFile('.env.local'); } catch {}

function summarize(session: Session): SessionSummary {
  return { ownerId: session.ownerId, createdAt: session.createdAt, casePrep: session.state.casePrep };
}

async function loadSessions(): Promise<SessionSummary[]> {
  if (process.env.DEVILS_RUNTIME_MODE === 'local') {
    const path = process.env.DEVILS_SQLITE_PATH ?? '.local/devils.sqlite';
    const db = new DatabaseSync(path, { readOnly: true });
    const rows = db.prepare("SELECT data FROM records WHERE kind='sessions'").all() as { data: string }[];
    db.close();
    return rows.map(row => summarize(JSON.parse(row.data) as Session));
  }
  const url = process.env.DEVILS_SUPABASE_URL;
  const key = process.env.DEVILS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set DEVILS_SUPABASE_URL and DEVILS_SUPABASE_SERVICE_ROLE_KEY, or DEVILS_RUNTIME_MODE=local.');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sessions: SessionSummary[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('sessions').select('data').range(from, from + 999);
    if (error) throw new Error(`Could not read conversations: ${error.message}`);
    sessions.push(...(data as { data: Session }[]).map(row => summarize(row.data)));
    if (data.length < 1000) break;
  }
  return sessions;
}

const result = returnRate(await loadSessions(), new Date());
console.log(`People who completed a case: ${result.completers}`);
console.log(`Came back within 30 days:    ${result.returned}`);
console.log(`Still inside their 30 days:  ${result.stillOpen}`);
console.log(result.rate === null ? 'Return rate: no completions yet' : `Return rate: ${(result.rate * 100).toFixed(1)}%`);
console.log('Deleted conversations and accounts are not counted.');
