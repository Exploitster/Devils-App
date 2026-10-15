import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { buildSupabaseSetup, readMigrations } from './lib/supabase-setup.mjs';

// Isolated SQL verification, not a replacement for real Supabase auth checks.
// No exposed ports, network access, production data, or application credentials.
const image = 'postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3';
const container = `devils-sql-${randomUUID().slice(0, 12)}`;
let started = false;
function docker(args, input) {
  return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
}
function sql(text, database = 'postgres') {
  return docker(['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], text);
}
function expectSqlFailure(text, expected, database = 'devils_bundle') {
  let failure;
  try { sql(text, database); } catch (error) { failure = error; }
  assert.ok(failure, 'Expected setup rejection did not occur.');
  assert.match(String(failure.stderr), expected);
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
  // Exercise the exact single-file handoff, including a second Run click.
  sql('CREATE DATABASE devils_bundle');
  sql(readFileSync(new URL('../tests/postgres/bootstrap.sql', import.meta.url), 'utf8').replace(/^CREATE ROLE .*\n/gm, ''), 'devils_bundle');
  const setup = buildSupabaseSetup();
  sql(setup, 'devils_bundle');
  sql(readFileSync(new URL('../tests/postgres/assertions.sql', import.meta.url), 'utf8'), 'devils_bundle');
  sql(`SET ROLE service_role;
    SELECT public.app_store('putProfile', '{"profile":{"id":"00000000-0000-4000-8000-000000000003","email":"migration@example.test","disabled":false,"deletionState":"none","createdAt":"2026-10-15T10:00:00Z"}}');
    SELECT public.app_store('createSession', '{"userId":"00000000-0000-4000-8000-000000000003","input":{"mode":"business","topic":"migration preservation"},"now":"2026-10-15T10:00:00Z"}', '00000000-0000-4000-8000-000000000003');`, 'devils_bundle');
  sql(setup, 'devils_bundle');
  const sources = readMigrations();
  const changed = sources.map((item, index) => index === 0 ? { ...item, sql: item.sql + '\n-- changed applied migration' } : item);
  expectSqlFailure(buildSupabaseSetup(changed), /Applied migration .* has changed/);
  const lastVersion = sources.at(-1).name.split('_')[0];
  const testVersion = offset => (BigInt(lastVersion) + BigInt(offset)).toString().padStart(lastVersion.length, '0');
  const future = [...sources, { name: `${testVersion(1)}_future_test.sql`, sql: 'ALTER TABLE public.profiles ADD COLUMN migration_test text;' }];
  sql(buildSupabaseSetup(future), 'devils_bundle');
  sql(buildSupabaseSetup(future), 'devils_bundle');
  expectSqlFailure(setup, /Database has migrations absent from this file/);
  const failed = [...future, { name: `${testVersion(2)}_rollback_test.sql`, sql: 'CREATE TABLE public.should_rollback(id integer); SELECT 1 / 0;' }];
  expectSqlFailure(buildSupabaseSetup(failed), /division by zero/);
  expectSqlFailure(setup, /Existing app tables have no migration receipts/, 'postgres');
  sql(`DO $$ BEGIN
    IF (SELECT count(*) FROM public.devils_schema_migrations) <> ${sources.length + 1} THEN RAISE EXCEPTION 'Migration history was not preserved'; END IF;
    IF to_regclass('public.should_rollback') IS NOT NULL THEN RAISE EXCEPTION 'Failed migration was not rolled back'; END IF;
    IF (SELECT count(*) FROM public.sessions) <> 1 THEN RAISE EXCEPTION 'Saved session was changed by a migration retry'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='migration_test') THEN RAISE EXCEPTION 'Future migration did not run'; END IF;
    IF has_table_privilege('anon', 'public.devils_schema_migrations', 'SELECT') OR has_table_privilege('authenticated', 'public.devils_schema_migrations', 'INSERT') THEN RAISE EXCEPTION 'Migration receipts exposed'; END IF;
  END $$;`, 'devils_bundle');
  console.log('Complete bundle: initial setup, repeat run, data preservation, future migration, checksum/downgrade refusal and failed-migration rollback passed.');
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
