import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LocalStore } from '../../src/lib/store/local';
import { ConversationEngine } from '../../src/lib/conversation/engine';
import { DeterministicModel } from '../../src/lib/model/deterministic';
import { createEvidenceService } from '../../src/lib/evidence/service';
import { readConfig } from '../../src/lib/config';
import { SessionSchema, type Mode } from '../../src/lib/contracts';

// Offline fixture evaluation. This checks contracts, not real Gemini quality.
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as {
  id: string; mode: Mode; input: string; checks: string[];
}[];
const config = readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'offline-evaluation-only-'.repeat(2), DEVILS_BETA_ACTIVE: 'true' });
let now = new Date('2026-10-15T10:00:00.000Z');
const store = new LocalStore(':memory:');
const results: unknown[] = [];
try {
  await store.putProfile({ id: 'synthetic-evaluation', email: 'evaluation@example.test', disabled: false, deletionState: 'none', createdAt: now.toISOString() });
  await store.putInvite({ userId: 'synthetic-evaluation', enabled: true, expiresAt: '2027-01-01T00:00:00.000Z' });
  const engine = new ConversationEngine({ store, config, model: new DeterministicModel(), evidence: createEvidenceService(), clock: { now: () => now } });
  for (const item of cases) {
    now = new Date(now.getTime() + 61000);
    const session = await store.createSession('synthetic-evaluation', { mode: item.mode, topic: item.mode === 'business' ? 'startup' : 'life' }, now.toISOString());
    let saved = await engine.turn('synthetic-evaluation', session.id, { operationId: `${item.id}-turn`, expectedRevision: 0, text: item.input, action: 'message' });
    SessionSchema.parse(saved);
    assert.equal(saved.revision, 1);
    if (['crisis-paraphrase', 'political-refusal'].includes(item.id)) {
      assert.equal(saved.state.phase, 'support');
      assert.deepEqual(saved.state.counterpoints, []);
    } else {
      saved = await engine.card('synthetic-evaluation', session.id, { operationId: `${item.id}-card`, expectedRevision: saved.revision });
      SessionSchema.parse(saved);
      assert.equal(saved.cards.at(-1)?.closing, 'Your call. Always.');
      if (item.id === 'business-early-card') assert.deepEqual(saved.cards.at(-1)?.counterpoints, []);
    }
    results.push({ id: item.id, mechanicalContract: 'passed', session: saved, qualitativeReview: 'pending', qualitativeChecks: item.checks });
  }
  mkdirSync('.local/evaluations', { recursive: true });
  writeFileSync('.local/evaluations/latest.json', JSON.stringify({ adapter: 'deterministic', externalRequests: 0, liveGeminiQuality: 'not evaluated', results }, null, 2));
  console.log(`${results.length} offline fixture contracts passed. Responses saved to .local/evaluations/latest.json for qualitative review. No external API calls; live Gemini quality remains unverified.`);
} finally { store.close(); }
