'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AccessDecision, Identity } from '@/lib/contracts';
export class ApiError extends Error {
    constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal });
    const data = await response.json();
    if (!response.ok)
        throw new ApiError(data.error?.message ?? 'The request could not complete.', response.status);
    return data;
}
export interface AuthData {
    user: Identity | null;
    access?: AccessDecision;
    config: {
        runtimeMode: string;
        betaActive: boolean;
        launchDate: string;
    };
}
export function ErrorNotice({ error, retry }: {
    error: string;
    retry?: () => void;
}) { return <div className="notice" role="alert">
      <p>{error}</p>{retry && <button onClick={retry}>Try again</button>}</div>; }
function subscribeTheme(listener: () => void) {
    window.addEventListener('storage', listener); window.addEventListener('devils-theme', listener);
    return () => { window.removeEventListener('storage', listener); window.removeEventListener('devils-theme', listener); };
}
export function Shell({ children, mode = 'business' }: {
    children: ReactNode;
    mode?: string;
}) {
    const path = usePathname();
    const router = useRouter();
    const dark = useSyncExternalStore(subscribeTheme, () => localStorage.getItem('devils-theme') === 'dark', () => false);
    const [auth, setAuth] = useState<AuthData>();
    useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
    useEffect(() => { api<AuthData>('/api/auth').then(setAuth).catch(() => { }); }, []);
    function theme() { localStorage.setItem('devils-theme', dark ? 'light' : 'dark'); window.dispatchEvent(new Event('devils-theme')); }
    return <div className="app" data-mode={mode}>
      <a href="#main" className="skip">Skip to content</a>
      <aside className="sidebar">
      <Link className="wordmark" href={auth?.user ? '/home' : '/'}>Devils Advocate<span>Your call. Always.</span>
      </Link>
      <nav aria-label="Main navigation">{['Home', 'History', 'Billing', 'Account'].map(label => <Link key={label} href={`/${label.toLowerCase()}`} aria-current={path.startsWith(`/${label.toLowerCase()}`) ? 'page' : undefined}>{label}</Link>)}</nav>
      <div className="sidebar-bottom">
      <button className="quiet" onClick={theme}>{dark ? 'Light' : 'Dark'} theme</button>{auth?.user && <button className="quiet" onClick={async () => { await api('/api/auth', 'DELETE'); router.push('/login'); }}>Sign out</button>}</div>
      </aside>
      <div className="workspace">{auth?.config.runtimeMode === 'local' && <header className="runtime">Local development · deterministic AI · no email/payment sent</header>}<main id="main" className="main">{auth?.access && !auth.access.allowed && <div className="notice">Generation access is {auth.access.reason}. Your history, export and deletion remain available. <Link href="/billing">View plans</Link>
      </div>}{children}</main>
      <footer>Think it through. Keep the decision. <a href="https://exploitster.github.io/devilsadvocate/">Visit our website</a></footer>
      </div>
      </div>;
}
