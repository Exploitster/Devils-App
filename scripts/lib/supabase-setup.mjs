import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const literal = value => `'${value.replaceAll("'", "''")}'`;

export function readMigrations(directory = new URL('../../supabase/migrations/', import.meta.url)) {
  return readdirSync(directory).filter(name => /^\d+_[a-z0-9_]+\.sql$/i.test(name)).sort()
    .map(name => ({ name, sql: readFileSync(new URL(name, directory), 'utf8') }));
}

/** Generate one transaction for the SQL Editor. Existing migration receipts are
 * checked, never overwritten; new migrations are applied in filename order. */
export function buildSupabaseSetup(migrations = readMigrations()) {
  if (!migrations.length) throw new Error('No database migrations found.');
  const names = migrations.map(item => item.name);
  if (new Set(names).size !== names.length || names.some((name, index) =>
    !/^\d+_[a-z0-9_]+\.sql$/i.test(name) || (index > 0 && name <= names[index - 1]))) {
    throw new Error('Migration names must be unique and sorted.');
  }
  const initialTables = [...migrations[0].sql.matchAll(/create table public\.([a-z_]+)/gi)].map(match => match[1]);
  const blocks = migrations.map(({ name, sql }) => {
    const checksum = createHash('sha256').update(sql).digest('hex');
    const delimiter = `$migration_${checksum.slice(0, 16)}$`;
    if (sql.includes(delimiter)) throw new Error('Migration SQL delimiter collision.');
    return `
  -- ${name}
  SELECT checksum INTO installed FROM public.devils_schema_migrations WHERE version = ${literal(name)};
  IF installed IS NULL THEN
    pending_seen := true;
    EXECUTE ${delimiter}\n${sql}\n${delimiter};
    INSERT INTO public.devils_schema_migrations(version, checksum) VALUES (${literal(name)}, ${literal(checksum)});
  ELSE
    IF pending_seen THEN
      RAISE EXCEPTION 'Migration history has a gap before %. Stop and review the database.', ${literal(name)};
    END IF;
    IF installed <> ${literal(checksum)} THEN
      RAISE EXCEPTION 'Applied migration % has changed. Add a new migration; do not edit applied files.', ${literal(name)};
    END IF;
  END IF;`;
  });
  return `-- DEVILS ADVOCATE COMPLETE DATABASE SETUP -- START
-- Run the ENTIRE file in Supabase SQL Editor with no text selected.
-- Starts with BEGIN and finishes with COMMIT and a success result.
-- No keys, external connections, payments, DROP or data deletion are used.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('devils-schema-migrations', 0));
CREATE TABLE IF NOT EXISTS public.devils_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.devils_schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.devils_schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.devils_schema_migrations TO service_role;
DO $devils_setup$
DECLARE installed text; pending_seen boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.devils_schema_migrations WHERE version NOT IN (${names.map(literal).join(', ')})) THEN
    RAISE EXCEPTION 'Database has migrations absent from this file. Generate the newest setup; do not downgrade.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.devils_schema_migrations)
    AND (${initialTables.map(name => `to_regclass('public.${name}') IS NOT NULL`).join(' OR ') || 'false'}) THEN
    RAISE EXCEPTION 'Existing app tables have no migration receipts. Nothing was changed. Review the existing schema before setup.';
  END IF;
${blocks.join('\n')}
END;
$devils_setup$;
COMMIT;
SELECT 'Devils Advocate database setup complete' AS status, count(*) AS migrations_applied
FROM public.devils_schema_migrations;
-- DEVILS ADVOCATE COMPLETE DATABASE SETUP -- END
`;
}
