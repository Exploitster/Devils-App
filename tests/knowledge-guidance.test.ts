import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalKnowledgeStore } from '../src/lib/knowledge/local-store';
import { echoesGuidance, guidanceFor, guidanceSearch } from '../src/lib/knowledge/guidance';
import type { KnowledgeStore } from '../src/lib/knowledge/store';
import { areasFor } from '../src/lib/case-prep/frameworks';
import { startCase } from '../src/lib/case-prep/reducer';
import { caseContext } from '../src/lib/conversation/state';
import { privacyDisclosure } from '../src/lib/privacy/deletion';
import type { CasePrep, Session } from '../src/lib/contracts';

const now = '2026-11-09T10:00:00.000Z';
const business = areasFor('business');
const money = business.find(area => area.id === 'money')!;
const stores: LocalKnowledgeStore[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); vi.useRealTimers(); vi.restoreAllMocks(); });

function session(messages: string[] = []): Session {
  return { id: 's', ownerId: 'u', mode: 'business', topic: 'startup', title: 'Dental reminders', revision: 0,
    state: { phase: 'clarifying', position: messages[0] ?? '', underlyingQuestion: '', clarifications: [], strengths: [], counterpoints: [], openQuestions: [], nextStep: '', usedArgumentIds: [], usedEvidenceIds: [], summary: '' },
    messages: messages.flatMap((text, index) => [{ id: `u${index}`, role: 'user' as const, text, createdAt: now, citations: [] }, { id: `a${index}`, role: 'assistant' as const, text: 'Which part next?', createdAt: now, citations: [] }]),
    cards: [], createdAt: now, updatedAt: now };
}
function onArea(areaId: string): CasePrep { return { ...startCase('business', business), currentAreaId: areaId }; }
const turnRequest = (answer: string, areaId = 'money') => ({ session: session(), context: caseContext(onArea(areaId), business, 'message', answer), areas: business });
const assessmentRequest = (answers: string[]) => ({ session: session(answers), context: caseContext(onArea('money'), business, 'assessment'), areas: business });
function recording(results: { text: string }[] = []) {
  const search = vi.fn(async () => results);
  return { store: { search } as unknown as KnowledgeStore, search };
}
function logged(spy: { mock: { calls: unknown[][] } }, event: string) {
  return spy.mock.calls.map(call => JSON.parse(String(call[0]))).filter(record => record.event === event);
}
async function library(items: { title: string; passages: string[]; status: 'approved' | 'review' | 'rejected' }[]) {
  const store = new LocalKnowledgeStore(':memory:'); stores.push(store);
  for (const item of items) {
    const created = await store.createItem({ kind: 'text', status: 'review', title: item.title, text: item.passages.join('\n\n'), mimeType: 'text/plain', sizeBytes: 10 }, now);
    if (item.status === 'approved') await store.approveItem(created.id, item.passages, now);
    if (item.status === 'rejected') await store.setStatus(created.id, { status: 'rejected' }, now);
  }
  return store;
}

describe('guidance search terms', () => {
  it('matches on the latest answer cut at 2,000 characters, ranks by the area and the case, and takes 3', async () => {
    const answer = `I'll charge $10 a month. ${'Clinics keep paying. '.repeat(150)}`;
    expect(answer.length).toBeGreaterThan(2000);
    const { store, search } = recording();
    await guidanceFor(store, turnRequest(answer));
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith({ match: answer.slice(0, 2000), rank: `${money.label} ${money.establishes} Dental reminders startup` }, 3);
    expect(guidanceSearch(turnRequest(answer)).query.match).toHaveLength(2000);
  });

  it('matches an assessment on every answer cut at 4,000 characters, ranks by every area and the case, and takes 5', async () => {
    const answers = ['Dental clinics in Porto lose six hours a week to missed appointments.', 'Each practice pays 99 euros a month.', 'A long answer. '.repeat(400)];
    const { store, search } = recording();
    await guidanceFor(store, assessmentRequest(answers));
    const [query, limit] = search.mock.calls[0] as unknown as [{ match: string; rank: string }, number];
    expect(limit).toBe(5);
    expect(query.match).toBe(answers.join('\n').slice(0, 4000));
    expect(query.match.startsWith(`${answers[0]}\n${answers[1]}\n`)).toBe(true);
    expect(query.rank).toBe([...business.flatMap(area => [area.label, area.establishes]), 'Dental reminders', 'startup'].join(' '));
  });
});

describe('guidance from the approved library', () => {
  it('carries the approved pricing note for a money answer, and never a note in review or rejected', async () => {
    const store = await library([
      { title: 'Pricing notes', passages: ['A monthly price only works when the customer sees value every month.'], status: 'approved' },
      { title: 'Draft pricing', passages: ['A draft passage about the monthly price.'], status: 'review' },
      { title: 'Old pricing', passages: ['A rejected passage about the monthly price.'], status: 'rejected' },
    ]);
    expect(await guidanceFor(store, turnRequest("I'll charge $10 a month"))).toEqual([{ text: 'A monthly price only works when the customer sees value every month.' }]);
  });

  it('never returns a passage that shares only an area word with an off-topic answer', async () => {
    const store = await library([{ title: 'Segments', passages: ['Customers who feel the problem most will pay first.'], status: 'approved' }]);
    const offTopic = turnRequest('I redesigned the logo of my recipe blog in pastel colours.', 'customer');
    // The area's words alone would find the passage, so only the answer keeps it out.
    expect(await store.search({ match: guidanceSearch(offTopic).query.rank! }, 3)).toHaveLength(1);
    expect(await guidanceFor(store, turnRequest('I redesigned the logo of my recipe blog in pastel colours.', 'customer'))).toEqual([]);
    expect(await guidanceFor(store, turnRequest('My customers are dental clinics.', 'customer'))).toEqual([{ text: 'Customers who feel the problem most will pay first.' }]);
  });

  it('returns nothing and logs nothing without a library', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await guidanceFor(undefined, turnRequest("I'll charge $10 a month"))).toEqual([]);
    expect(info).not.toHaveBeenCalled();
  });
});

describe('a failing library search', () => {
  it('yields no guidance and logs one failure when the store throws', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const store = { search: vi.fn(async () => { throw new Error('connection reset with private details'); }) } as unknown as KnowledgeStore;
    expect(await guidanceFor(store, turnRequest("I'll charge $10 a month"))).toEqual([]);
    expect(logged(info, 'knowledge_search_failed')).toHaveLength(1);
    expect(JSON.stringify(info.mock.calls)).not.toContain('private details');
  });

  it('gives up after 1.5 seconds with no guidance and one failure log when the store takes 2 seconds', async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const store = { search: vi.fn(() => new Promise(resolve => setTimeout(() => resolve([{ text: 'Too late.' }]), 2000))) } as unknown as KnowledgeStore;
    let settled: unknown;
    const pending = guidanceFor(store, turnRequest("I'll charge $10 a month")).then(value => (settled = value));
    await vi.advanceTimersByTimeAsync(1499);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(logged(info, 'knowledge_search_failed')).toHaveLength(1);
  });
});

describe('the echo check', () => {
  const passage = { text: 'Founders who charge from the first week learn more about real demand than founders who give the product away, because payment tests intent.' };
  const words = passage.text.split(' ');
  it('flags a reply that repeats 12 or more consecutive words of a passage, ignoring case and punctuation', () => {
    expect(echoesGuidance([`So, ${words.slice(0, 15).join(' ').toUpperCase()}?`], [passage])).toBe(true);
    expect(echoesGuidance(['Fine.', `${words.slice(3, 15).join(' ')}`], [passage])).toBe(true);
  });
  it('passes a reply that shares fewer than 12 consecutive words with every passage', () => {
    expect(echoesGuidance([`Do ${words.slice(0, 8).join(' ')} in your case?`], [passage])).toBe(false);
    expect(echoesGuidance([words.slice(0, 11).join(' ')], [passage])).toBe(false);
    expect(echoesGuidance([words.slice(0, 15).join(' ')], [])).toBe(false);
  });
  it('does not join separate text fields into one run', () => {
    expect(echoesGuidance([words.slice(0, 6).join(' '), words.slice(6, 12).join(' ')], [passage])).toBe(false);
  });
});

it('tells account holders that private guidance from the app owner may go to the model provider', () => {
  expect(privacyDisclosure.model).toMatch(/private guidance from the app.s owner/i);
  expect(privacyDisclosure.model).not.toMatch(/selected evidence are sent/);
});
