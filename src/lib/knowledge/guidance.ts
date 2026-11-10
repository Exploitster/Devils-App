import type { CaseContext, KnowledgePassage, Session } from '../contracts';
import type { CaseArea } from '../case-prep/frameworks';
import { AppError } from '../errors';
import { logEvent } from '../logging';
import type { KnowledgeSearch, KnowledgeStore } from './store';

/**
 * Private guidance from the owner's approved library for one case-prep call. The person's own
 * words decide which passages match; the area and the case only order the matches, so generic
 * area words never pull a passage in alone. No AI call is made, so this works for any provider.
 */
export interface GuidanceRequest { session: Session; context: CaseContext; areas: readonly CaseArea[]; }

const turn = { answerChars: 2000, limit: 3 };
const assessment = { answerChars: 4000, limit: 5 };
const timeoutMs = 1500;
/** A reply that repeats this many consecutive words of a passage is reciting it. */
const echoRunWords = 12;

export function guidanceSearch({ session, context, areas }: GuidanceRequest): { query: KnowledgeSearch; limit: number } {
  const caseWords = [session.title, session.topic];
  if (context.purpose === 'assessment') {
    const answers = session.messages.filter(message => message.role === 'user').map(message => message.text).join('\n');
    return { query: { match: answers.slice(0, assessment.answerChars), rank: [...areas.flatMap(area => [area.label, area.establishes]), ...caseWords].join(' ') }, limit: assessment.limit };
  }
  const area = context.currentArea;
  return { query: { match: (context.latestAnswer ?? '').slice(0, turn.answerChars), rank: [...(area ? [area.label, area.establishes] : []), ...caseWords].join(' ') }, limit: turn.limit };
}

/** Never fails the turn: an error or a slow search logs one event and gives no guidance. */
export async function guidanceFor(knowledge: KnowledgeStore | undefined, request: GuidanceRequest): Promise<KnowledgePassage[]> {
  if (!knowledge) return [];
  const { query, limit } = guidanceSearch(request);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const search = knowledge.search(query, limit);
    const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AppError('KNOWLEDGE_TIMEOUT', 'The library search took too long.', 504)), timeoutMs); });
    search.catch(() => {});
    return (await Promise.race([search, expired])).map(({ text }) => ({ text }));
  } catch (error) {
    logEvent('knowledge_search_failed', { code: error instanceof AppError ? error.code : 'KNOWLEDGE_SEARCH_FAILED' });
    return [];
  } finally { clearTimeout(timer); }
}

function words(text: string): string[] { return text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
function runs(list: string[]): string[] { return list.slice(0, Math.max(0, list.length - echoRunWords + 1)).map((_, index) => list.slice(index, index + echoRunWords).join(' ')); }

export function echoesGuidance(texts: readonly string[], passages: readonly KnowledgePassage[]): boolean {
  const known = new Set(passages.flatMap(passage => runs(words(passage.text))));
  return known.size > 0 && texts.some(text => runs(words(text)).some(run => known.has(run)));
}
