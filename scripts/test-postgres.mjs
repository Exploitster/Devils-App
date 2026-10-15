import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Isolated SQL verification, not a replacement for real Supabase auth checks.
// No exposed ports, network access, production data, or application credentials.
const image = 'postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3';
const container = `devils-sql-${randomUUID().slice(0, 12)}`;
let started = false;
function docker(args, input) {
  return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
}
function sql(text) {
  return docker(['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], text);
}
try {
  docker(['version', '--format', '{{.Server.Version}}']);
  try { docker(['image', 'inspect', image]); }
  catch { console.log('Pulling the checksum-pinned PostgreSQL test image.'); docker(['pull', image]); }
  docker(['run', '-d', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!ready) throw new Error('The isolated PostgreSQL service did not become ready.');
  sql(readFileSync(new URL('../tests/postgres/bootstrap.sql', import.meta.url), 'utf8'));
  const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) {
    sql(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
    console.log(`Applied ${migration}`);
  }
  sql(readFileSync(new URL('../tests/postgres/assertions.sql', import.meta.url), 'utf8'));
  console.log('Passed SQL ownership, RLS, privilege, revision reservation, idempotency, cancellation, cascade and disabled-account read assertions.');
  console.log('Supabase JWT issuance and hosted authentication remain separate sandbox checks.');
} catch (error) {
  console.error('PostgreSQL validation failed:', error.message);
  if (error.stderr) console.error(String(error.stderr).slice(-3000));
  process.exitCode = 1;
} finally {
  if (started) {
    try { docker(['rm', '-f', '-v', container]); }
    catch { console.error(`Cleanup failed for this run’s test container: ${container}`); process.exitCode = 1; }
  }
}
