import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

// Execute the actual publication shell step with local stand-ins for Vercel
// and HTTP checks. No credentials, hosted requests or deployments are made.
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const step = workflow.split('      - name: Publish checked build; restore previous release on failure')[1];
const shell = step.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
function publish(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'devils-release-'));
  const trace = join(directory, 'calls');
  try {
    writeFileSync(join(directory, 'vercel'), `#!/bin/sh
printf '%s %s\\n' "$1" "$2" >> "$TRACE_FILE"
case "$1:$2" in
  api:/v4/aliases/*) printf '{"deploymentId":"dpl_previous"}' ;;
  api:/v9/projects/*) exit "$FREEZE_EXIT" ;;
  promote:*) exit "$PROMOTE_EXIT" ;;
  rollback:*) exit "$ROLLBACK_EXIT" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
    writeFileSync(join(directory, 'node'), `#!/bin/sh
if [ "$1" = 'scripts/smoke-deployment.mjs' ]; then
  printf 'smoke\\n' >> "$TRACE_FILE"
  exit "$SMOKE_EXIT"
fi
exec "$REAL_NODE" "$@"
`, { mode: 0o700 });
    const result = spawnSync('bash', ['-c', shell], { encoding: 'utf8', env: {
      NODE_ENV: 'test', PATH: `${directory}:${dirname(process.execPath)}:/usr/bin:/bin`,
      REAL_NODE: process.execPath, TRACE_FILE: trace, RUNNER_TEMP: directory,
      VERCEL_TOKEN: 'synthetic-test-only', VERCEL_ORG_ID: 'team_test',
      DEPLOYMENT_URL: 'https://candidate.vercel.app', PROMOTE_EXIT: '0', FREEZE_EXIT: '0',
      SMOKE_EXIT: '0', ROLLBACK_EXIT: '0', ...overrides,
    } });
    return { ...result, calls: readFileSync(trace, 'utf8') };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

const failures: Record<string, string>[] = [{ PROMOTE_EXIT: '1' }, { SMOKE_EXIT: '1' }, { FREEZE_EXIT: '1' }];
describe('production publication failure recovery', () => {
  it('checks the live site after promotion and freezes automatic assignment', () => {
    const result = publish(); expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toContain('promote https://candidate.vercel.app');
    expect(result.calls).toContain('api /v9/projects/');
    expect(result.calls).toContain('smoke');
    expect(result.calls).not.toContain('rollback');
  });
  it.each(failures)('rolls back and fails the release when a publication step fails %#', failure => {
    const result = publish(failure); expect(result.status).toBe(1);
    expect(result.calls).toContain('rollback dpl_previous');
  });
  it('reports a failed rollback and keeps the release failed', () => {
    const result = publish({ PROMOTE_EXIT: '1', ROLLBACK_EXIT: '1' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::Automatic rollback failed');
    expect(result.stdout).not.toContain('Release failed. Rollback to the previous deployment completed.');
  });
});
