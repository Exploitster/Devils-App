import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from '../src/lib/store/local';
import { LocalKnowledgeStore } from '../src/lib/knowledge/local-store';
import { studioUnavailable } from '../src/lib/knowledge/supabase-store';
import type { KnowledgeStore } from '../src/lib/knowledge/store';
import { readConfig } from '../src/lib/config';
import { ConversationEngine } from '../src/lib/conversation/engine';
import { caseContext } from '../src/lib/conversation/state';
import { DeterministicModel } from '../src/lib/model/deterministic';
import { casePrepInstructions, providerInput } from '../src/lib/model/provider';
import { createEvidenceService } from '../src/lib/evidence/service';
import { areasFor, type CaseArea } from '../src/lib/case-prep/frameworks';
import { startCase } from '../src/lib/case-prep/reducer';
import { caseAreaLabels, liveQuestionSet, publishQuestionSet, restoreQuestionSet } from '../src/lib/case-prep/versions';
import type { ModelInput, Session } from '../src/lib/contracts';
import { POST as signInRoute } from '../src/app/api/auth/route';
import { POST as createSessionRoute } from '../src/app/api/sessions/route';
import { GET as getSessionRoute } from '../src/app/api/sessions/[id]/route';
import { POST as turnRoute } from '../src/app/api/sessions/[id]/turns/route';
import { GET as getFrameworks, POST as postFrameworks } from '../src/app/api/studio/frameworks/route';

const strong = [
  'Dental clinics in Porto lose about six hours a week phoning patients who miss appointments.',
  'Independent dental practices with two front-desk staff, where the owner signs off on software.',
];
const now = '2026-11-09T10:00:00.000Z';
const custom: CaseArea[] = [
  { id: 'pain', label: 'The pain', establishes: 'A painful problem.', strongSignals: ['names a real moment'], followUps: ['Ask for the last time it happened.'], opening: 'When did this problem last cost someone real money?' },
  { id: 'buyer', label: 'The buyer', establishes: 'Who pays first.', strongSignals: ['names one buyer'], followUps: ['Ask who signs the cheque.'], opening: 'Which single person would sign the first cheque?' },
];

let dir: string;
const stores: LocalStore[] = [];
let knowledge: LocalKnowledgeStore;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'devils-versions-')); knowledge = new LocalKnowledgeStore(join(dir, 'knowledge.sqlite')); });
afterEach(() => { knowledge.close(); stores.splice(0).forEach(store => store.close()); rmSync(dir, { recursive: true, force: true }); });

async function engineWith(source: KnowledgeStore | undefined) {
  const store = new LocalStore(':memory:');
  stores.push(store);
  let time = new Date('2026-11-09T12:00:00Z').getTime();
  const clock = { now: () => new Date((time += 6000)) };
  const config = readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32), DEVILS_BETA_ACTIVE: 'true' });
  await store.putProfile({ id: 'u', email: 'a@example.com', disabled: false, deletionState: 'none', createdAt: '2026-11-09T12:00:00Z' });
  await store.putInvite({ userId: 'u', enabled: true, expiresAt: '2027-11-09T00:00:00Z' });
  const engine = new ConversationEngine({ store, config, evidence: createEvidenceService(), model: new DeterministicModel(), clock, ...(source ? { knowledge: source } : {}) });
  let op = 0;
  return async () => {
    let session: Session = await store.createSession('u', { mode: 'business', topic: 'startup' }, '2026-11-09T12:00:00Z');
    return {
      say: async (text: string) => (session = await engine.turn('u', session.id, { operationId: `op-${++op}`, expectedRevision: session.revision, text, action: 'message' })),
      assess: async () => (session = await engine.card('u', session.id, { operationId: `op-${++op}`, expectedRevision: session.revision })),
    };
  };
}
const ids = (session: Session) => session.state.casePrep!.areas.map(area => area.id);

describe('cases pinned to a question-set version', () => {
  it('keeps a case on the version it started with after a newer one is published, and starts new cases on the newer one', async () => {
    for (let n = 0; n < 3; n++) await publishQuestionSet(knowledge, 'business', areasFor('business'), `Edit ${n + 1}`, now);
    const newCase = await engineWith(knowledge);
    const early = await newCase();
    expect((await early.say(strong[0])).state.casePrep).toMatchObject({ frameworkVersion: 3 });

    const withoutFounder = areasFor('business').filter(area => area.id !== 'founder');
    expect((await publishQuestionSet(knowledge, 'business', withoutFounder, 'Drop “Why you”', now)).version).toBe(4);

    const turned = await early.say(strong[1]);
    expect(turned.state.casePrep).toMatchObject({ frameworkVersion: 3 });
    expect(ids(turned)).toHaveLength(9);
    const assessed = await early.assess();
    expect(assessed.state.casePrep!.assessment!.areas.map(area => area.id)).toContain('founder');
    expect(assessed.state.casePrep!.assessment!.areas).toHaveLength(9);
    expect(await caseAreaLabels(knowledge, assessed)).toHaveLength(9);

    const later = await (await newCase()).say(strong[0]);
    expect(later.state.casePrep).toMatchObject({ frameworkVersion: 4 });
    expect(ids(later)).toEqual(withoutFounder.map(area => area.id));
  });

  it('runs a case saved without a version on the built-in set, even after a version is published', async () => {
    const newCase = await engineWith(knowledge);
    const legacy = await newCase();
    const first = await legacy.say(strong[0]);
    expect(first.state.casePrep!.frameworkVersion).toBeUndefined();
    await publishQuestionSet(knowledge, 'business', custom, undefined, now);
    const second = await legacy.say(strong[1]);
    expect(second.messages.at(-1)!.text).toBe(areasFor('business')[2].opening);
    expect(await caseAreaLabels(knowledge, second)).toEqual(areasFor('business').map(({ id, label }) => ({ id, label })));
  });

  it('asks a published set’s own openings on the next new case', async () => {
    await publishQuestionSet(knowledge, 'business', custom, undefined, now);
    const session = await (await (await engineWith(knowledge))()).say(strong[0]);
    expect(ids(session)).toEqual(['pain', 'buyer']);
    expect(session.messages.at(-1)!.text).toBe('Which single person would sign the first cheque?');
  });

  it('assesses a case whose published areas use the longest allowed “what it must establish” text', async () => {
    const long = custom.map(area => ({ ...area, establishes: `${area.label}: ${'x'.repeat(2000 - area.label.length - 2)}` }));
    await publishQuestionSet(knowledge, 'business', long, undefined, now);
    const started = await (await engineWith(knowledge))();
    await started.say(strong[0]);
    const assessed = await started.assess();
    const rows = assessed.state.casePrep!.assessment!.areas;
    expect(rows.some(row => row.nextStep?.endsWith(long[1].establishes))).toBe(true);
  });

  it('starts cases on the built-in set when the Studio database update is not applied', async () => {
    const missing = { getVersion: async () => { throw studioUnavailable(); } } as unknown as KnowledgeStore;
    expect(await liveQuestionSet(missing, 'business')).toEqual({ mode: 'business', version: 0, areas: areasFor('business') });
    const session = await (await (await engineWith(missing))()).say(strong[0]);
    expect(session.state.casePrep!.frameworkVersion).toBeUndefined();
    expect(ids(session)).toEqual(areasFor('business').map(area => area.id));
  });
});

describe('publishing and restoring', () => {
  it('rejects an invalid set and stores nothing', async () => {
    await expect(publishQuestionSet(knowledge, 'business', [{ ...custom[0], followUps: [] }], undefined, now)).rejects.toMatchObject({ code: 'INVALID_QUESTION_SET', message: '“The pain”: add at least one follow-up.' });
    expect(await knowledge.listVersions('business')).toEqual([]);
  });

  it('restores an earlier version as a new highest version with a note', async () => {
    const first = await publishQuestionSet(knowledge, 'business', custom, 'Short set', now);
    await publishQuestionSet(knowledge, 'business', areasFor('business'), undefined, now);
    await publishQuestionSet(knowledge, 'business', custom.slice(0, 1), undefined, now);
    const restored = await restoreQuestionSet(knowledge, 'business', 1, now);
    expect(restored).toMatchObject({ version: 4, note: 'Restored from version 1', areas: first.areas });
    expect((await liveQuestionSet(knowledge, 'business')).areas).toEqual(custom);
  });

  it('restores the built-in default as a new version equal to the code set', async () => {
    await publishQuestionSet(knowledge, 'philosophy', custom, undefined, now);
    const restored = await restoreQuestionSet(knowledge, 'philosophy', 0, now);
    expect(restored).toMatchObject({ version: 2, note: 'Restored built-in default', areas: areasFor('philosophy') });
  });

  it('refuses to restore a version that does not exist', async () => {
    await expect(restoreQuestionSet(knowledge, 'business', 7, now)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('the pinned set in the model input', () => {
  const input = (areas: CaseArea[], text: string): ModelInput => {
    const record = startCase('business', areas);
    return {
      session: { id: 's', ownerId: 'o', mode: 'business', topic: 'startup', title: 'Case', revision: 0, state: { phase: 'clarifying', position: text, underlyingQuestion: '', clarifications: [], strengths: [], counterpoints: [], openQuestions: [], nextStep: '', usedArgumentIds: [], usedEvidenceIds: [], summary: '', casePrep: record }, messages: [], cards: [], createdAt: now, updatedAt: now },
      request: { operationId: 'op', expectedRevision: 0, text, action: 'message' }, task: 'turn', evidence: [], now,
      caseAreas: areas, caseContext: caseContext(record, areas, 'message', text),
    };
  };

  it('has the simulated AI open the next area with that area’s own opening', async () => {
    const result = await new DeterministicModel().generate(input(custom, strong[0]), new AbortController().signal);
    expect((result.output as { casePrep: { nextAreaQuestion: string } }).casePrep.nextAreaQuestion).toBe('Which single person would sign the first cheque?');
  });

  it('sends the current and next openings to the provider but never the full set', () => {
    const marked = [...custom, { ...custom[1], id: 'third', label: 'Never sent', opening: 'Is this third area ever sent?' }];
    const payload = JSON.stringify(providerInput(input(marked, strong[0])));
    expect(payload).toContain('When did this problem last cost someone real money?');
    expect(payload).toContain('Which single person would sign the first cheque?');
    expect(payload).not.toContain('Is this third area ever sent?');
    expect(payload).not.toContain('caseAreas');
    expect(casePrepInstructions).toMatch(/nextAreaQuestion builds on the next area's opening/);
  });
});

describe('question sets over requests', () => {
  const origin = 'http://127.0.0.1:3000';
  beforeEach(() => {
    vi.stubEnv('DEVILS_RUNTIME_MODE', 'local'); vi.stubEnv('DEVILS_LOCAL_AUTH_SECRET', 'a-development-signing-secret-with-32-characters');
    vi.stubEnv('DEVILS_SQLITE_PATH', join(dir, 'app.sqlite')); vi.stubEnv('DEVILS_APP_URL', origin); vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEVILS_PAYMENTS_ENABLED', 'false'); vi.stubEnv('DEVILS_OWNER_EMAILS', 'sam@example.test');
  });
  afterEach(() => vi.unstubAllEnvs());
  async function signIn(email: string) {
    const response = await signInRoute(new Request(`${origin}/api/auth`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email }) }));
    return response.headers.get('set-cookie')!.split(';')[0];
  }
  const call = (cookie: string, path: string, body?: unknown) => new Request(`${origin}${path}`, body === undefined ? { headers: { cookie } } : { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  async function startedCase(cookie: string) {
    const created = await (await createSessionRoute(call(cookie, '/api/sessions', { mode: 'business', topic: 'startup' }))).json();
    expect(created.caseAreas).toEqual([]);
    const turned = await (await turnRoute(call(cookie, `/api/sessions/${created.session.id}/turns`, { operationId: crypto.randomUUID(), expectedRevision: created.session.revision, text: strong[0], action: 'message' }), params(created.session.id))).json();
    return turned as { session: Session; caseAreas: { id: string; label: string }[] };
  }

  it('labels the progress areas from each case’s own version, so a rename shows only on later cases', async () => {
    const owner = await signIn('sam@example.test');
    const before = await startedCase(owner);
    expect(before.caseAreas).toEqual(areasFor('business').map(({ id, label }) => ({ id, label })));

    const renamed = areasFor('business').map(area => area.id === 'problem' ? { ...area, label: 'The pain' } : area);
    const published = await postFrameworks(call(owner, '/api/studio/frameworks', { action: 'publish', mode: 'business', areas: renamed, note: 'Rename the first area' }));
    expect(published.status).toBe(201);
    expect((await published.json()).version).toMatchObject({ version: 1, note: 'Rename the first area' });

    const reloaded = await (await getSessionRoute(call(owner, `/api/sessions/${before.session.id}`), params(before.session.id))).json();
    expect(reloaded.caseAreas[0]).toEqual({ id: 'problem', label: 'Problem and why now' });
    const after = await startedCase(owner);
    expect(after.caseAreas[0]).toEqual({ id: 'problem', label: 'The pain' });
  });

  it('lists versions for the owner, restores the default, and shows the reason a set is rejected', async () => {
    const owner = await signIn('sam@example.test');
    const empty = await (await getFrameworks(call(owner, '/api/studio/frameworks?mode=philosophy'))).json();
    expect(empty).toEqual({ mode: 'philosophy', live: { mode: 'philosophy', version: 0, areas: areasFor('philosophy') }, versions: [] });

    const rejected = await postFrameworks(call(owner, '/api/studio/frameworks', { action: 'publish', mode: 'philosophy', areas: [{ ...custom[0], opening: 'No question here.' }] }));
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toEqual({ code: 'INVALID_QUESTION_SET', message: '“The pain”: the opening must be one question ending in “?”.' });

    expect((await postFrameworks(call(owner, '/api/studio/frameworks', { action: 'publish', mode: 'philosophy', areas: custom }))).status).toBe(201);
    expect((await postFrameworks(call(owner, '/api/studio/frameworks', { action: 'restore', mode: 'philosophy', version: 0 }))).status).toBe(201);
    const listed = await (await getFrameworks(call(owner, '/api/studio/frameworks?mode=philosophy'))).json();
    expect(listed.live).toMatchObject({ version: 2, note: 'Restored built-in default', areas: areasFor('philosophy') });
    expect(listed.versions.map((version: { version: number; note?: string }) => [version.version, version.note])).toEqual([[2, 'Restored built-in default'], [1, undefined]]);
  });

  it('gives anyone but the owner the standard not-found response', async () => {
    const other = await signIn('alex@example.test');
    for (const response of [await getFrameworks(call(other, '/api/studio/frameworks?mode=business')), await postFrameworks(call(other, '/api/studio/frameworks', { action: 'restore', mode: 'business', version: 0 }))]) {
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe('NOT_FOUND');
    }
  });
});
