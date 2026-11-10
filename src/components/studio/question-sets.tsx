'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, ErrorNotice } from '@/components/app';
import type { FrameworkArea, FrameworkVersionSummary, Mode } from '@/lib/contracts';
import { MAX_AREAS, MAX_LINES } from '@/lib/limits';
import { errorMessage } from './review';

interface QuestionSet { mode: Mode; version: number; areas: FrameworkArea[]; note?: string; createdAt?: string; }
interface Listing { mode: Mode; live: QuestionSet; versions: FrameworkVersionSummary[]; }
/** An area as edited here. `key` only tracks the card; `id` is kept for areas that already have one. */
interface DraftArea { key: string; id?: string; label: string; establishes: string; opening: string; followUps: string[]; strongSignals: string[]; }
type Lines = 'followUps' | 'strongSignals';

const modes: { value: Mode; label: string }[] = [{ value: 'business', label: 'Business' }, { value: 'philosophy', label: 'Personal' }];
const lineNames: Record<Lines, { heading: string; one: string; add: string }> = {
  followUps: { heading: 'Follow-ups', one: 'follow-up', add: 'Add follow-up' },
  strongSignals: { heading: 'What a strong answer shows', one: 'sign', add: 'Add sign' },
};

let keys = 0;
const newKey = () => `area-${++keys}`;
const toDraft = (areas: FrameworkArea[]): DraftArea[] => areas.map(area => ({ ...area, key: newKey(), followUps: [...area.followUps], strongSignals: [...area.strongSignals] }));
const toAreas = (draft: DraftArea[]) => draft.map(({ key: _key, id, ...area }) => { void _key; return id === undefined ? area : { id, ...area }; });
function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
/** A rejection names the area as “Its name” or "Area N"; a repeated name points at the later of the two. */
function rejectedArea(message: string, draft: DraftArea[]): string | undefined {
  const numbered = /^Area (\d+):/.exec(message);
  if (numbered) return draft[Number(numbered[1]) - 1]?.key;
  const named = /^“(.*)”:/.exec(message);
  if (!named) return undefined;
  const matches = draft.filter(area => area.label.trim() === named[1]);
  return (message.includes('another area already has') ? matches[1] ?? matches[0] : matches[0])?.key;
}

export function QuestionSets({ readOnly, onUnavailable }: { readOnly: boolean; onUnavailable: () => void }) {
  const [mode, setMode] = useState<Mode>('business');
  const [listings, setListings] = useState<Partial<Record<Mode, Listing>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<Mode, DraftArea[]>>>({});
  const [dirty, setDirty] = useState<Record<Mode, boolean>>({ business: false, philosophy: false });
  const [note, setNote] = useState('');
  const [rejection, setRejection] = useState<{ key?: string; message: string }>();
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);

  const fail = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.code === 'STUDIO_UNAVAILABLE') onUnavailable();
    else setError(errorMessage(caught));
  }, [onUnavailable]);
  const show = useCallback((listing: Listing) => {
    setListings(current => ({ ...current, [listing.mode]: listing }));
    setDrafts(current => ({ ...current, [listing.mode]: toDraft(listing.live.areas) }));
    setDirty(current => ({ ...current, [listing.mode]: false }));
    setError('');
  }, []);
  const load = useCallback((which: Mode) => api<Listing>(`/api/studio/frameworks?mode=${which}`).then(show).catch(fail), [show, fail]);
  useEffect(() => { void load('business'); }, [load]);

  const listing = listings[mode];
  const draft = drafts[mode];
  function edit(change: (areas: DraftArea[]) => DraftArea[]) {
    setDrafts(current => ({ ...current, [mode]: change(current[mode] ?? []) }));
    setDirty(current => ({ ...current, [mode]: true }));
  }
  const editArea = (key: string, patch: Partial<DraftArea>) => edit(areas => areas.map(area => area.key === key ? { ...area, ...patch } : area));
  const editLines = (key: string, field: Lines, change: (lines: string[]) => string[]) => edit(areas => areas.map(area => area.key === key ? { ...area, [field]: change(area[field]) } : area));

  /** Runs `then` straight away, or after the owner agrees to lose the current mode's unsaved edits. */
  function guarded(then: () => void) {
    if (!dirty[mode]) { then(); return; }
    pending.current = then; dialog.current?.showModal(); keepEditing.current?.focus();
  }
  function discard() {
    const then = pending.current; pending.current = null;
    dialog.current?.close();
    const live = listings[mode]?.live.areas;
    if (live) setDrafts(current => ({ ...current, [mode]: toDraft(live) }));
    setDirty(current => ({ ...current, [mode]: false })); setRejection(undefined);
    then?.();
  }
  function switchMode(next: Mode) {
    if (next === mode) return;
    guarded(() => { setMode(next); setRejection(undefined); setAnnouncement(''); if (!listings[next]) void load(next); });
  }

  async function publish() {
    if (!draft) return;
    setBusy(true); setError(''); setRejection(undefined); setAnnouncement('');
    try {
      const { version } = await api<{ version: { version: number } }>('/api/studio/frameworks', 'POST', { action: 'publish', mode, areas: toAreas(draft), ...(note.trim() ? { note: note.trim() } : {}) });
      setNote(''); await load(mode); setAnnouncement(`Published version ${version.version}.`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'INVALID_QUESTION_SET') setRejection({ key: rejectedArea(caught.message, draft), message: caught.message });
      else fail(caught);
    } finally { setBusy(false); }
  }
  function restore(version: number) {
    guarded(async () => {
      setBusy(true); setError(''); setRejection(undefined); setAnnouncement('');
      try {
        const restored = await api<{ version: { version: number } }>('/api/studio/frameworks', 'POST', { action: 'restore', mode, version });
        await load(mode);
        setAnnouncement(`Restored ${version === 0 ? 'the built-in default' : `version ${version}`} as version ${restored.version.version}.`);
      } catch (caught) { fail(caught); } finally { setBusy(false); }
    });
  }

  const liveVersion = listing?.live.version ?? 0;
  const generalRejection = rejection && !rejection.key ? rejection.message : '';
  return <div className="studio-question-sets">
    <div className="studio-mode" role="group" aria-label="Question set">
      {modes.map(option => <button key={option.value} type="button" aria-pressed={mode === option.value} onClick={() => switchMode(option.value)}>{option.label}</button>)}
    </div>
    <p className="fine studio-announcement" role="status">{announcement}</p>
    {error && <ErrorNotice error={error} retry={listing ? undefined : () => void load(mode)}/>}
    {!draft || !listing ? <p className="fine" role="status">Loading the question set…</p> : <div className="studio-columns studio-sets">
      <div className="studio-editor">
        <p className="fine">Live now: {liveVersion === 0 ? 'the built-in default' : `version ${liveVersion}`}. New cases start on the live version and keep it to the end, so publishing never changes a case in progress.</p>
        {generalRejection && <p className="notice error-notice" role="alert">{generalRejection}</p>}
        <fieldset className="studio-editor-fields" disabled={readOnly || busy}>
          <legend className="sr-only">Areas</legend>
          {draft.map((area, index) => {
            const rejected = rejection?.key === area.key ? rejection.message : '';
            const id = (field: string) => `${area.key}-${field}`;
            return <fieldset key={area.key} className="panel studio-area" aria-describedby={rejected ? id('error') : undefined}>
              <legend>Area {index + 1}: {area.label || 'New area'}</legend>
              {rejected && <p id={id('error')} className="notice error-notice" role="alert">{rejected}</p>}
              <label htmlFor={id('label')}>Name</label>
              <input id={id('label')} value={area.label} maxLength={200} onChange={event => editArea(area.key, { label: event.target.value })}/>
              <label htmlFor={id('establishes')}>What it must establish</label>
              <textarea id={id('establishes')} rows={2} value={area.establishes} maxLength={2000} onChange={event => editArea(area.key, { establishes: event.target.value })}/>
              <label htmlFor={id('opening')}>Opening question</label>
              <textarea id={id('opening')} rows={2} value={area.opening} maxLength={1000} onChange={event => editArea(area.key, { opening: event.target.value })}/>
              {(['followUps', 'strongSignals'] as const).map(field => {
                const names = lineNames[field]; const lines = area[field];
                return <div key={field} className="studio-lines" role="group" aria-labelledby={id(field)}>
                  <h3 id={id(field)}>{names.heading}</h3>
                  <ol>{lines.map((line, n) => {
                    const name = `${names.one} ${n + 1}`;
                    return <li key={n}>
                      <label className="sr-only" htmlFor={id(`${field}-${n}`)}>{name[0].toUpperCase() + name.slice(1)}</label>
                      <input id={id(`${field}-${n}`)} value={line} maxLength={field === 'followUps' ? 1000 : 500} onChange={event => editLines(area.key, field, list => list.map((value, at) => at === n ? event.target.value : value))}/>
                      <span className="studio-line-actions">
                        <button type="button" className="small" aria-label={`Move ${name} up`} disabled={n === 0} onClick={() => editLines(area.key, field, list => move(list, n, -1))}>Up</button>
                        <button type="button" className="small" aria-label={`Move ${name} down`} disabled={n === lines.length - 1} onClick={() => editLines(area.key, field, list => move(list, n, 1))}>Down</button>
                        <button type="button" className="small" aria-label={`Remove ${name}`} disabled={lines.length === 1} onClick={() => editLines(area.key, field, list => list.filter((_, at) => at !== n))}>Remove</button>
                      </span>
                    </li>;
                  })}</ol>
                  <button type="button" className="small" disabled={lines.length >= MAX_LINES} onClick={() => editLines(area.key, field, list => [...list, ''])}>{names.add}</button>
                </div>;
              })}
              <div className="actions studio-area-actions">
                <button type="button" className="small" aria-label={`Move area ${index + 1} up`} disabled={index === 0} onClick={() => edit(areas => move(areas, index, -1))}>Move up</button>
                <button type="button" className="small" aria-label={`Move area ${index + 1} down`} disabled={index === draft.length - 1} onClick={() => edit(areas => move(areas, index, 1))}>Move down</button>
                <button type="button" className="small danger" aria-label={`Remove area ${index + 1}`} disabled={draft.length === 1} onClick={() => edit(areas => areas.filter(item => item.key !== area.key))}>Remove area</button>
              </div>
            </fieldset>;
          })}
          <button type="button" disabled={draft.length >= MAX_AREAS} onClick={() => edit(areas => [...areas, { key: newKey(), label: '', establishes: '', opening: '', followUps: [''], strongSignals: [''] }])}>Add area</button>
          <div className="panel studio-publish">
            <label htmlFor="studio-version-note">Note (optional)</label>
            <input id="studio-version-note" value={note} maxLength={500} onChange={event => setNote(event.target.value)}/>
            <button type="button" className="primary" onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish new version'}</button>
            {dirty[mode] && <p className="fine">You have unpublished changes.</p>}
          </div>
        </fieldset>
      </div>
      <section className="panel studio-history" aria-labelledby="studio-history-title">
        <h2 id="studio-history-title">Version history</h2>
        <ol aria-label="Version history">
          {listing.versions.map(entry => <li key={entry.version}>
            <div>
              <strong>Version {entry.version}</strong>{entry.version === liveVersion && <span className="studio-badge status-approved">Live</span>}
              {entry.note && <p>{entry.note}</p>}
              <p className="fine">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
            {entry.version !== liveVersion && <button type="button" className="small" aria-label={`Restore version ${entry.version}`} disabled={readOnly || busy} onClick={() => restore(entry.version)}>Restore</button>}
          </li>)}
          <li>
            <div>
              <strong>Built-in default</strong>{liveVersion === 0 && <span className="studio-badge status-approved">Live</span>}
              <p>The question set the app ships with.</p>
            </div>
            {liveVersion !== 0 && <button type="button" className="small" aria-label="Restore built-in default" disabled={readOnly || busy} onClick={() => restore(0)}>Restore</button>}
          </li>
        </ol>
      </section>
    </div>}
    <dialog ref={dialog} aria-labelledby="studio-discard-title" onClose={() => { pending.current = null; }}>
      <h2 id="studio-discard-title">Discard unsaved changes?</h2>
      <p>Your edits to this question set have not been published and will be lost.</p>
      <div className="actions">
        <button ref={keepEditing} type="button" onClick={() => dialog.current?.close()}>Keep editing</button>
        <button type="button" className="danger" onClick={discard}>Discard changes</button>
      </div>
    </dialog>
  </div>;
}
