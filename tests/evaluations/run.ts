import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LocalStore } from '../../src/lib/store/local';
import { ConversationEngine } from '../../src/lib/conversation/engine';
import { DeterministicModel } from '../../src/lib/model/deterministic';
import { createEvidenceService } from '../../src/lib/evidence/service';
import { readConfig } from '../../src/lib/config';
import { areasFor } from '../../src/lib/case-prep/frameworks';
import { SessionSchema, type Mode, type Session, type Topic, type TurnAction } from '../../src/lib/contracts';

// Offline evaluation. This checks contracts and question discipline with the simulated AI, not real model quality.
interface Step { action: TurnAction; text: string }
interface Case { id: string; kind: 'case' | 'support'; mode: Mode; topic: Topic; script?: Step[]; input?: string; expectFollowUpsThenMoveOn?: boolean; checks: string[] }
const file = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as { strongAnswer: string; cases: Case[] };
const VERDICT = /you should (do|not|go|quit|stop|leave)|don'?t do (this|it)|go\s*\/\s*no-?go|\bno-?go\b|\d+\s*%\s*(chance|likely)|probability|out of 10|\b\d+\/10\b|verdict/i;
const ANNOUNCEMENT = 'Every area is covered. I am writing your assessment now.';
const MAX_TURNS = 60;
const TURN_SPACING_MS = 7000;

const config = readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'offline-evaluation-only-'.repeat(2), DEVILS_BETA_ACTIVE: 'true' });
let now = new Date('2026-10-15T10:00:00.000Z');
const store = new LocalStore(':memory:');
const results: unknown[] = [];

function assertOneQuestion(text: string, where: string) {
  assert.equal((text.match(/\?/g) ?? []).length, 1, `${where}: expected exactly one question mark in "${text}"`);
  assert.ok(text.trim().endsWith('?'), `${where}: the question must end the turn`);
}
function assertNoVerdict(text: string, where: string) { assert.ok(!VERDICT.test(text), `${where}: verdict or probability wording in "${text}"`); }

try {
  await store.putProfile({ id: 'synthetic-evaluation', email: 'evaluation@example.test', disabled: false, deletionState: 'none', createdAt: now.toISOString() });
  await store.putInvite({ userId: 'synthetic-evaluation', enabled: true, expiresAt: '2027-01-01T00:00:00.000Z' });
  const engine = new ConversationEngine({ store, config, model: new DeterministicModel(), evidence: createEvidenceService(), clock: { now: () => now } });
  for (const item of file.cases) {
    now = new Date(now.getTime() + 61000);
    const userId = 'synthetic-evaluation';
    const created = await store.createSession(userId, { mode: item.mode, topic: item.topic }, now.toISOString());
    let saved: Session;
    if (item.kind === 'support') {
      saved = await engine.turn(userId, created.id, { operationId: `${item.id}-turn`, expectedRevision: 0, text: item.input!, action: 'message' });
      SessionSchema.parse(saved);
      assert.equal(saved.state.phase, 'support');
      assert.deepEqual(saved.state.counterpoints, []);
      assert.deepEqual(saved.cards, []);
      assert.equal(saved.state.casePrep?.assessment, undefined);
      results.push({ id: item.id, mechanicalContract: 'passed', session: saved, qualitativeReview: 'pending', qualitativeChecks: item.checks });
      continue;
    }
    saved = created;
    const script = [...item.script!];
    let turns = 0;
    let movedOnAfterThree = false;
    while (!saved.state.casePrep?.complete) {
      assert.ok(++turns <= MAX_TURNS, `${item.id}: case did not complete within ${MAX_TURNS} turns`);
      const step = script.shift() ?? { action: 'message' as const, text: file.strongAnswer };
      const before = saved.state.casePrep;
      now = new Date(now.getTime() + TURN_SPACING_MS);
      saved = await engine.turn(userId, created.id, { operationId: `${item.id}-turn-${turns}`, expectedRevision: saved.revision, text: step.text, action: step.action });
      SessionSchema.parse(saved);
      const reply = saved.messages.at(-1)!;
      assert.equal(reply.role, 'assistant');
      assertNoVerdict(reply.text, `${item.id} turn ${turns}`);
      if (saved.state.casePrep?.complete) assert.equal(reply.text, ANNOUNCEMENT);
      else assertOneQuestion(reply.text, `${item.id} turn ${turns}`);
      const after = saved.state.casePrep!;
      if (item.expectFollowUpsThenMoveOn && before && before.currentAreaId === after.areas[0].id && after.currentAreaId !== before.currentAreaId && after.areas[0].followUps === 3) movedOnAfterThree = true;
      if (step.action === 'correction') assert.ok(after.areas.some(area => area.status === 'not_asked') || !after.complete, `${item.id}: a correction must reopen at least one area`);
    }
    if (item.expectFollowUpsThenMoveOn) assert.ok(movedOnAfterThree, `${item.id}: expected three follow-ups on the first area, then a move to the next area`);
    now = new Date(now.getTime() + TURN_SPACING_MS);
    saved = await engine.card(userId, created.id, { operationId: `${item.id}-assessment`, expectedRevision: saved.revision });
    SessionSchema.parse(saved);
    assert.deepEqual(saved.cards, []);
    const assessment = saved.state.casePrep?.assessment;
    assert.ok(assessment, `${item.id}: no assessment written`);
    assert.deepEqual(assessment.areas.map(area => area.id), areasFor(item.mode).map(area => area.id));
    assert.equal(assessment.closing, 'Your call. Always.');
    assertNoVerdict(JSON.stringify(assessment), `${item.id} assessment`);
    results.push({ id: item.id, mechanicalContract: 'passed', turns, session: saved, qualitativeReview: 'pending', qualitativeChecks: item.checks });
  }
  mkdirSync('.local/evaluations', { recursive: true });
  writeFileSync('.local/evaluations/latest.json', JSON.stringify({ adapter: 'deterministic', externalRequests: 0, liveGeminiQuality: 'not evaluated', results }, null, 2));
  console.log(`${results.length} offline case contracts passed. Responses saved to .local/evaluations/latest.json for qualitative review. No external API calls; live model quality remains unverified.`);
} finally { store.close(); }
