'use client';
import { notFound } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, type AuthData, ErrorNotice, Shell } from '@/components/app';
import { Library } from '@/components/studio/library';
import { QuestionSets } from '@/components/studio/question-sets';

const tabs = [{ id: 'library', label: 'Library' }, { id: 'question-sets', label: 'Question sets' }] as const;
type Tab = (typeof tabs)[number]['id'];

/** The owner's private page. Anyone else, signed in or not, gets the standard not-found page. */
export default function StudioPage() {
  const [access, setAccess] = useState<'checking' | 'owner' | 'missing' | 'failed'>('checking');
  const [readOnly, setReadOnly] = useState(false);
  const [tab, setTab] = useState<Tab>('library');
  const [unavailable, setUnavailable] = useState(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const check = useCallback(() => {
    api<AuthData>('/api/auth').then(data => {
      setReadOnly(data.config.sharedDataRehearsal === true);
      setAccess(data.owner ? 'owner' : 'missing');
    }).catch(() => setAccess('failed'));
  }, []);
  useEffect(() => { check(); }, [check]);
  const markUnavailable = useCallback(() => setUnavailable(true), []);

  if (access === 'missing') notFound();
  if (access === 'checking') return <div className="page-loading" role="status"><span className="loading-orb"/>Opening the Studio…</div>;
  if (access === 'failed') return <main id="main" className="main"><ErrorNotice error="We couldn’t check your access. Check your connection and try again." retry={() => { setAccess('checking'); check(); }}/></main>;

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.findIndex(entry => entry.id === tab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id;
    setTab(next); tabRefs.current[next]?.focus();
  }
  return <Shell>
    <div className="page-heading"><div><p className="eyebrow">PRIVATE TO YOU</p><h1>Studio</h1><p className="lead">Add your own notes and recordings, and shape the questions every new case asks. Users never see your material quoted.</p></div></div>
    {readOnly && <p className="notice studio-read-only" role="note">Read-only on the test site. You can look around, but adding, approving and publishing are turned off here.</p>}
    {unavailable ? <section className="panel studio-unavailable" aria-labelledby="studio-unavailable-title">
      <h2 id="studio-unavailable-title">Studio isn’t set up yet: apply migration 005</h2>
      <p>The Studio needs its database update before it can store material or question sets. Follow the Studio steps in <code>docs/setup-guide.md</code>. Until then, case prep uses the built-in question sets.</p>
    </section> : <>
      <div className="studio-tabs" role="tablist" aria-label="Studio sections" onKeyDown={keyboard}>
        {tabs.map(entry => <button key={entry.id} ref={element => { tabRefs.current[entry.id] = element; }} type="button" role="tab" id={`studio-tab-${entry.id}`} aria-controls={`studio-panel-${entry.id}`} aria-selected={tab === entry.id} tabIndex={tab === entry.id ? 0 : -1} onClick={() => setTab(entry.id)}>{entry.label}</button>)}
      </div>
      {/* Both stay mounted so an unpublished question-set draft survives a visit to the library. */}
      {tabs.map(entry => <div key={entry.id} role="tabpanel" id={`studio-panel-${entry.id}`} aria-labelledby={`studio-tab-${entry.id}`} hidden={tab !== entry.id}>
        {entry.id === 'library' ? <Library readOnly={readOnly} onUnavailable={markUnavailable}/> : <QuestionSets readOnly={readOnly} onUnavailable={markUnavailable}/>}
      </div>)}
    </>}
  </Shell>;
}
