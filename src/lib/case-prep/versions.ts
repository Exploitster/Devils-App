import { AppError, notFound } from '../errors';
import type { FrameworkVersion, FrameworkVersionSummary, Mode, Session } from '../contracts';
import type { KnowledgeStore } from '../knowledge/store';
import { logEvent } from '../logging';
import { areasFor, parseQuestionSet, type CaseArea } from './frameworks';

/** Server code only: the sets stay out of the browser bundle. */
export interface QuestionSet { mode: Mode; version: number; areas: CaseArea[]; note?: string; createdAt?: string; }

function builtIn(mode: Mode): QuestionSet { return { mode, version: 0, areas: areasFor(mode) }; }
function fromStored(stored: FrameworkVersion): QuestionSet { return { mode: stored.mode, version: stored.version, areas: stored.areas, ...(stored.note === undefined ? {} : { note: stored.note }), createdAt: stored.createdAt }; }

/** The set a new case starts on. Before the Studio's database update is applied, that is the built-in set. */
export async function liveQuestionSet(knowledge: KnowledgeStore | undefined, mode: Mode): Promise<QuestionSet> {
  if (!knowledge) return builtIn(mode);
  try {
    const stored = await knowledge.getVersion(mode);
    return stored ? fromStored(stored) : builtIn(mode);
  } catch (error) {
    if (error instanceof AppError && error.code === 'STUDIO_UNAVAILABLE') return builtIn(mode);
    throw error;
  }
}

/** The set a case is pinned to. A case saved without a version is on version 0. */
export async function pinnedQuestionSet(knowledge: KnowledgeStore | undefined, mode: Mode, version = 0): Promise<QuestionSet> {
  if (version === 0) return builtIn(mode);
  const stored = await knowledge?.getVersion(mode, version);
  // Versions are append-only, so a case's pinned version always exists.
  if (!stored) throw new Error(`Question-set version ${version} for ${mode} is missing.`);
  return fromStored(stored);
}

export async function questionSetFor(knowledge: KnowledgeStore | undefined, session: Session): Promise<QuestionSet> {
  const record = session.state.casePrep;
  return record ? pinnedQuestionSet(knowledge, session.mode, record.frameworkVersion) : liveQuestionSet(knowledge, session.mode);
}

/** Area names for the browser's progress strip, from the case's own version; empty before a case starts. */
export async function caseAreaLabels(knowledge: KnowledgeStore | undefined, session: Session): Promise<{ id: string; label: string }[]> {
  const record = session.state.casePrep;
  if (!record) return [];
  return (await pinnedQuestionSet(knowledge, session.mode, record.frameworkVersion)).areas.map(({ id, label }) => ({ id, label }));
}

export async function publishQuestionSet(knowledge: KnowledgeStore, mode: Mode, input: unknown, note: string | undefined, now: string): Promise<FrameworkVersion> {
  const published = await knowledge.publishVersion(mode, parseQuestionSet(input), note, now);
  logEvent('framework_published');
  return published;
}

/** Copies an earlier version, or the built-in set (version 0), into a new live version. History is never rewritten. */
export async function restoreQuestionSet(knowledge: KnowledgeStore, mode: Mode, version: number, now: string): Promise<FrameworkVersion> {
  const source = version === 0 ? builtIn(mode) : await knowledge.getVersion(mode, version);
  if (!source) throw notFound();
  return publishQuestionSet(knowledge, mode, source.areas, version === 0 ? 'Restored built-in default' : `Restored from version ${version}`, now);
}

export async function listQuestionSets(knowledge: KnowledgeStore, mode: Mode): Promise<{ mode: Mode; live: QuestionSet; versions: FrameworkVersionSummary[] }> {
  const [live, versions] = await Promise.all([knowledge.getVersion(mode), knowledge.listVersions(mode)]);
  return { mode, live: live ? fromStored(live) : builtIn(mode), versions };
}
