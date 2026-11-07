'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Identity, Session } from '@/lib/contracts';
import { api, Brand, Icon, ThemeButton } from './app';

const RECENT_LIMIT = 15;

/** Recent conversations, newest first; History holds the rest. */
function RecentConversations({ path }: { path: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    api<{ sessions: Session[] }>('/api/sessions').then(data => setSessions(data.sessions)).catch(() => setFailed(true));
  }, []);
  // Reload on navigation so a conversation started a moment ago appears.
  useEffect(() => { load(); }, [load, path]);
  return <section className="recent" aria-labelledby="recent-title">
    <h2 id="recent-title" className="recent-title">Recent</h2>
    {failed ? <p className="recent-note">Couldn’t load conversations. <button type="button" className="link-button" onClick={load}>Retry</button></p>
      : sessions === null ? <div className="recent-loading" role="status" aria-label="Loading conversations"><span/><span/><span/></div>
        : sessions.length === 0 ? <p className="recent-note">Your conversations will appear here.</p>
          : <ul>{sessions.slice(0, RECENT_LIMIT).map(session => {
            const href = `/sessions/${session.id}`;
            return <li key={session.id}><Link href={href} aria-current={path === href ? 'page' : undefined}>{session.title}</Link></li>;
          })}</ul>}
    <Link className="recent-all" href="/history" aria-current={path === '/history' ? 'page' : undefined}>All conversations</Link>
  </section>;
}

function AccountMenu({ user, onSignOut }: { user: Identity; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  const label = user.name || 'Your account';
  return <div className="account-menu" ref={root}>
    {open && <div className="account-popover" id="account-popover">
      <Link href="/account" onClick={() => setOpen(false)}><Icon name="account"/>Account</Link>
      <Link href="/billing" onClick={() => setOpen(false)}><Icon name="card"/>Billing</Link>
      <ThemeButton/>
      <button type="button" className="quiet" onClick={onSignOut}><Icon name="logout"/>Sign out</button>
    </div>}
    <button ref={trigger} type="button" className="account-trigger" aria-label="Account menu" aria-expanded={open} aria-controls="account-popover" onClick={() => setOpen(value => !value)}>
      <span className="avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
      <span className="account-name"><strong>{label}</strong><span>{user.email}</span></span>
    </button>
  </div>;
}

/** Desktop sidebar; below 1024px the same panel opens as a drawer from the top bar. */
export function AppSidebar({ user, path, open, onClose, onSignOut }: { user?: Identity | null; path: string; open: boolean; onClose: () => void; onSignOut: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);
  return <>
    {open && <div className="drawer-backdrop" aria-hidden="true" onClick={onClose}/>}
    <aside ref={panel} id="app-sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="Conversations and account">
      <Brand href="/home"/>
      <Link className="button primary new-conversation" href="/home"><Icon name="plus"/>New conversation</Link>
      <RecentConversations path={path}/>
      {user && <AccountMenu user={user} onSignOut={onSignOut}/>}
    </aside>
  </>;
}

export function AppTopBar({ open, onToggle, toggleRef }: { open: boolean; onToggle: () => void; toggleRef: React.RefObject<HTMLButtonElement | null> }) {
  return <header className="app-topbar">
    <button ref={toggleRef} type="button" className="quiet menu-button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="app-sidebar" onClick={onToggle}>
      <Icon name="menu"/>
    </button>
    <Brand href="/home"/>
    <Link className="quiet icon-link" href="/home" aria-label="Start a new conversation"><Icon name="plus"/></Link>
  </header>;
}
