import type { CasePrep } from '../contracts';

export interface SessionSummary {
  ownerId: string;
  createdAt: string;
  casePrep?: Pick<CasePrep, 'completedAt'>;
}

export interface ReturnRate {
  /** People who have completed at least one case. */
  completers: number;
  /** Completers who started another case within the window after a completion. */
  returned: number;
  /** Completers who have not returned yet but whose latest window is still open. */
  stillOpen: number;
  /** returned / completers, or null when nobody has completed a case. */
  rate: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Completion is the first full assessment of a case; a return is the same
 * person starting another case-prep conversation within `windowDays` after it.
 */
export function returnRate(sessions: SessionSummary[], now: Date, windowDays = 30): ReturnRate {
  const windowMs = windowDays * DAY_MS;
  const cases = sessions.filter(session => session.casePrep);
  const byOwner = new Map<string, SessionSummary[]>();
  for (const session of cases) byOwner.set(session.ownerId, [...(byOwner.get(session.ownerId) ?? []), session]);

  let completers = 0;
  let returned = 0;
  let stillOpen = 0;
  for (const owned of byOwner.values()) {
    const completions = owned.flatMap(session => (session.casePrep?.completedAt ? [Date.parse(session.casePrep.completedAt)] : []));
    if (!completions.length) continue;
    completers++;
    const starts = owned.map(session => Date.parse(session.createdAt));
    const came = completions.some(done => starts.some(start => start > done && start - done <= windowMs));
    if (came) returned++;
    else if (now.getTime() - Math.max(...completions) < windowMs) stillOpen++;
  }
  return { completers, returned, stillOpen, rate: completers ? returned / completers : null };
}
