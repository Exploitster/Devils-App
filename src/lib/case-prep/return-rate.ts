import type { CasePrep } from '../contracts';

export interface SessionSummary {
  ownerId: string;
  createdAt: string;
  casePrep?: Pick<CasePrep, 'completedAt'>;
}

export interface ReturnRate {
  completers: number;
  returned: number;
  stillOpen: number;
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
  for (const session of cases) {
    const owned = byOwner.get(session.ownerId) ?? [];
    owned.push(session);
    byOwner.set(session.ownerId, owned);
  }

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
