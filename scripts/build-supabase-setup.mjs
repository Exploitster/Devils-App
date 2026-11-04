import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildSupabaseSetup, readMigrations } from './lib/supabase-setup.mjs';

const output = resolve(process.argv[2] ?? '.local/supabase/Devils-Advocate-Supabase-Setup.sql');
const migrations = readMigrations();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, buildSupabaseSetup(migrations));
console.log(`Prepared complete setup (${migrations.length} versioned migrations): ${output}`);
