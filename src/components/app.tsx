'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AccessDecision, Identity } from '@/lib/contracts';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message ?? 'The request could not complete.', response.status);
  return data;
}
export interface AuthData { user: Identity | null; access?: AccessDecision; config: { runtimeMode: string; sharedDataRehearsal?:boolean; paymentsEnabled?: boolean; betaActive: boolean; launchDate: string; }; }
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .7 2.3L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-.7Z"/></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/><path d="M12 7v5l3 2"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a7 7 0 0 1 14-0v2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
    logout: <><path d="M9 4H4v16h5m6-12 4 4-4 4m-6-4h10"/></>,
    business: <><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 12a20 20 0 0 0 18 0M12 11v4"/></>,
    personal: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></>,
    check: <path d="m5 12 4 4L19 6"/>, shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    chat: <path d="M21 11a8 8 0 0 1-8 8H7l-5 3V11a9 9 0 0 1 19 0Z"/>,
    card: <><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 8h10M7 12h7M7 16h5"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}
export function Brand({ href = '/' }: { href?: string }) { return <Link className="wordmark" href={href}><span className="brand-symbol"><Icon name="spark" size={23}/></span><span>Devils Advocate<span className="brand-caption">Your call. Always.</span></span></Link>; }
export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) { return <div className="notice error-notice" role="alert"><p>{error}</p>{retry && <button onClick={retry}>Try again</button>}</div>; }
function subscribeTheme(listener: () => void) { window.addEventListener('storage', listener); window.addEventListener('devils-theme', listener); return () => { window.removeEventListener('storage', listener); window.removeEventListener('devils-theme', listener); }; }
export function ThemeButton() {
  const dark = useSyncExternalStore(subscribeTheme, () => { try { return localStorage.getItem('devils-theme') === 'dark'; } catch { return false; } }, () => false);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  return <button className="quiet theme-button" aria-label={`${dark ? 'Light' : 'Dark'} theme`} onClick={() => { try { localStorage.setItem('devils-theme', dark ? 'light' : 'dark'); } catch { /* Browser storage may be disabled. */ } window.dispatchEvent(new Event('devils-theme')); }}><Icon name={dark ? 'sun' : 'moon'}/><span>{dark ? 'Light' : 'Dark'} theme</span></button>;
}
export function IdeaVisual({ compact = false }: { compact?: boolean }) { return <div className={`idea-visual ${compact ? 'compact' : ''}`} aria-hidden="true"><div className="idea-orbit orbit-one"/><div className="idea-orbit orbit-two"/><div className="idea-core"><Icon name="spark" size={50}/></div><div className="idea-float float-one"><span className="icon-tile teal"><Icon name="check"/></span>Find what holds up.</div><div className="idea-float float-two"><span className="icon-tile violet"><Icon name="chat"/></span>See another angle.</div><div className="idea-float float-three"><span className="icon-tile blue"><Icon name="arrow"/></span>Choose your next step.</div></div>; }
export function Shell({ children, mode = 'business' }: { children: ReactNode; mode?: string }) {
  const path = usePathname(); const router = useRouter(); const [auth, setAuth] = useState<AuthData>(); const [error, setError] = useState('');
  const publicPage = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/privacy', '/terms', '/onboarding', '/about', '/features', '/business-validation', '/philosophical-reflection', '/how-it-works', '/pricing', '/faq', '/help', '/contact', '/security', '/sources', '/subscription-and-cancellation', '/refunds', '/accessibility'].includes(path);
  const recovery = path === '/reset-password';
  useEffect(() => { let active = true; api<AuthData>('/api/auth').then(data => { if (active) { setAuth(data); setError(''); if (!publicPage && !data.user) router.replace(path === '/billing' ? '/login?next=%2Fbilling' : '/login'); else if (!publicPage && data.access?.reason === 'disabled' && path !== '/account') router.replace('/account'); } }).catch(() => { if (active) setError('We couldn’t load your account. Check your connection and try again.'); }); return () => { active = false; }; }, [path, publicPage, router]);
  return <div className={`app ${publicPage ? 'public-app' : ''}`} data-mode={mode}>
    <nav aria-label="Skip navigation"><a href="#main" className="skip">Skip to content</a></nav>
    {publicPage ? <header className="public-header"><Brand/><nav aria-label="Main navigation">{!['/login', '/signup', '/forgot-password', '/reset-password', '/onboarding'].includes(path) && <><Link className="desktop-link" href="/features">Features</Link><Link className="desktop-link" href="/how-it-works">How it works</Link><Link href="/pricing">Pricing</Link><Link className="desktop-link" href="/help">Help</Link><Link className="desktop-link" href="/login">Sign in</Link><Link className="button primary small" href="/signup">Get started <Icon name="arrow" size={16}/></Link><details className="site-menu"><summary>Menu</summary><div>{[['/features','Features'],['/how-it-works','How it works'],['/business-validation','Business validation'],['/philosophical-reflection','Philosophy'],['/faq','FAQ'],['/help','Help'],['/login','Sign in']].map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</div></details></>}<div className="public-theme"><ThemeButton/></div></nav></header> : <aside className="sidebar"><Brand href="/home"/><Link className="button primary new-conversation" href="/home"><Icon name="plus"/>New conversation</Link><nav aria-label="Main navigation">{['Home', 'History', 'Billing', 'Account'].map(label => <Link key={label} href={`/${label.toLowerCase()}`} aria-current={path.startsWith(`/${label.toLowerCase()}`) ? 'page' : undefined}><Icon name={label.toLowerCase()}/><span>{label}</span></Link>)}</nav><div className="sidebar-note"><span className="availability-dot"/>A little space to think.<p>Another perspective.<br/>The decision stays yours.</p></div><div className="sidebar-bottom"><ThemeButton/>{auth?.user && <><div className="sidebar-profile"><span className="avatar">{(auth.user.name || auth.user.email).slice(0, 1).toUpperCase()}</span><div><strong>{auth.user.name || 'Your account'}</strong><span>{auth.user.email}</span></div></div><button className="quiet" aria-label="Sign out" onClick={async () => { try { await api('/api/auth', 'DELETE'); router.push('/login'); } catch (e) { setError((e as Error).message); } }}><Icon name="logout"/><span>Sign out</span></button></>}</div></aside>}
    <div className="workspace">{auth?.config.sharedDataRehearsal&&<section className="runtime" aria-label="Temporary test site">Temporary test site · Shares your existing account and saved data. Dodo test payments only.</section>}{auth?.config.runtimeMode === 'local' && <section className="runtime" aria-label="Development mode">Local demo · simulated AI responses · no emails sent</section>}<main id="main" className={`main ${publicPage ? 'public-main' : ''}`}>
      {error && !recovery && <ErrorNotice error={error} retry={() => window.location.reload()}/>}
      {!publicPage && !auth ? <div className="page-loading" role="status"><span className="loading-orb"/>Preparing your space…</div> : !publicPage && !auth?.user ? <p role="status">Taking you to sign in…</p> : <>{auth?.access && !auth.access.allowed && !publicPage && <div className="notice" role="status">Your account currently cannot create AI responses. Your history and account controls remain available. <Link href={auth.config.paymentsEnabled?"/billing":"/account"}>{auth.config.paymentsEnabled?'View subscription':'View account'}</Link></div>}{children}</>}
    </main><footer className={publicPage ? 'site-footer' : ''}><span>Devils Advocate. Your call. Always.</span><div>{(publicPage ? [['/about','About'],['/features','Features'],['/pricing','Pricing'],['/faq','FAQ'],['/help','Help'],['/contact','Contact'],['/sources','Sources'],['/security','Security'],['/accessibility','Accessibility'],['/subscription-and-cancellation','Subscription & cancellation'],['/refunds','Refunds'],['/privacy','Privacy'],['/terms','Terms']] : [['/help','Help'],['/privacy','Privacy'],['/terms','Terms']]).map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</div></footer></div>
  </div>;
}
