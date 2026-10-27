'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  analyticsConsentKey, analyticsPublicPaths, isAnalyticsPage,
  readAnalyticsConsent, validClarityProjectId, type AnalyticsConsent,
} from '@/lib/analytics-consent';

type ClarityFunction = ((...args: unknown[]) => void) & { q?: unknown[][] };
type AnalyticsWindow = Window & { clarity?: ClarityFunction; devilsClarityLoaded?: boolean };
const changeEvent = 'devils-analytics-choice';
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(changeEvent, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changeEvent, listener); };
}
function snapshot(): AnalyticsConsent {
  try { return readAnalyticsConsent(localStorage.getItem(analyticsConsentKey)); } catch { return 'declined'; }
}

function revokeClarityConsent() { (window as AnalyticsWindow).clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }); }

/** A loaded recorder stays inside public documents. Private navigation replaces
 * the document, so no running recorder is carried into a sign-in or conversation. */
function protectPrivateNavigation() {
  const requiresDocument = (raw: string | URL) => {
    const target = new URL(raw, window.location.href);
    const safePublicAnchor = analyticsPublicPaths.has(target.pathname) && !target.search && /^#[a-z0-9-]{1,64}$/.test(target.hash);
    return target.origin === window.location.origin && !safePublicAnchor && !isAnalyticsPage(target.pathname, target.search, target.hash);
  };
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!target || target.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (requiresDocument(target.href)) {
      event.preventDefault(); event.stopImmediatePropagation(); window.location.assign(target.href);
    }
  }, true);
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      if (url && requiresDocument(url)) { window.location.assign(new URL(url, window.location.href).href); return; }
      original(data, unused, url);
    };
  }
  const checkDocument = () => {
    if (snapshot() !== 'accepted' || requiresDocument(window.location.href)) {
      revokeClarityConsent();
      window.location.reload();
    }
  };
  window.addEventListener('popstate', checkDocument, true);
  // BFCache can restore this document after consent changed in another tab while
  // the page was frozen. Recheck the persisted value before continuing a replay.
  window.addEventListener('pageshow', event => { if (event.persisted) checkDocument(); }, true);
}
function loadClarity(projectId: string) {
  const browser = window as AnalyticsWindow;
  if (browser.devilsClarityLoaded) return;
  // Mask before the external script can observe the DOM. Strict dashboard masking
  // is also required by the owner setup instructions.
  document.body.setAttribute('data-clarity-mask', 'true');
  protectPrivateNavigation();
  browser.devilsClarityLoaded = true;
  const clarity: ClarityFunction = browser.clarity ?? Object.assign((...args: unknown[]) => { clarity.q!.push(args); }, { q: [] as unknown[][] });
  browser.clarity = clarity;
  clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
  const script = document.createElement('script');
  script.src = `https://www.clarity.ms/tag/${projectId}`;
  script.async = true;
  script.dataset.devilsAnalytics = 'clarity';
  document.head.appendChild(script);
}

export function AnalyticsConsent({ projectId }: { projectId?: string }) {
  const pathname = usePathname();
  const choice = useSyncExternalStore(subscribe, snapshot, () => 'unknown' as const);
  const [settings, setSettings] = useState(false);
  const [storageError, setStorageError] = useState('');
  const initialPublicDocument = useRef<boolean | undefined>(undefined);
  const configured = validClarityProjectId(projectId);
  useEffect(() => {
    initialPublicDocument.current ??= isAnalyticsPage(location.pathname, location.search, location.hash);
    if (choice !== 'accepted' && (window as AnalyticsWindow).devilsClarityLoaded) {
      revokeClarityConsent();
      window.location.reload();
      return;
    }
    if (configured && projectId && choice === 'accepted' && initialPublicDocument.current && isAnalyticsPage(location.pathname, location.search, location.hash)) loadClarity(projectId);
  }, [choice, configured, pathname, projectId]);
  function choose(next: 'accepted' | 'declined') {
    try {
      localStorage.setItem(analyticsConsentKey, next);
      window.dispatchEvent(new Event(changeEvent));
      setSettings(false); setStorageError('');
      if (next === 'declined' && (window as AnalyticsWindow).devilsClarityLoaded) {
        revokeClarityConsent();
        // Removing a script cannot stop an installed recorder. A fresh document
        // applies the persisted refusal before any analytics code can run again.
        window.location.reload();
      }
    } catch {
      if (next === 'declined' && (window as AnalyticsWindow).devilsClarityLoaded) {
        revokeClarityConsent();
        // A new document is required to remove an installed recorder.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${window.location.pathname}?analytics=off`);
        return;
      }
      setStorageError('Your browser could not save this choice. Analytics stays off; enable browser storage to change it.');
    }
  }
  // Private pages never offer an opt-in that would start a recorder. The settings
  // button still lets an existing preference be withdrawn from any app page.
  const publicPage = analyticsPublicPaths.has(pathname);
  if (!configured) return null;
  const show = settings || (publicPage && choice === 'unknown');
  return <>
    <button type="button" className="quiet analytics-settings" onClick={() => setSettings(value => !value)}>Analytics privacy choices</button>
    {show && <section className="analytics-consent panel" aria-labelledby="analytics-title" data-clarity-mask="true">
      <h2 id="analytics-title">Optional website analytics</h2>
      <p>With your permission, Microsoft Clarity helps us understand clicks, scrolling and page use on public website pages. Text is masked. Sign-in, account, billing and conversation pages are excluded.</p>
      <p>Clarity may process usage data and use analytics cookies. Choosing no does not affect the product. You can change your choice here anytime. <Link href="/privacy">Read our privacy notice</Link>.</p>
      <div className="analytics-actions actions">
        {publicPage && <button type="button" onClick={() => choose('accepted')}>Allow website analytics</button>}
        <button type="button" onClick={() => choose('declined')}>{choice === 'accepted' ? 'Turn analytics off' : 'No thanks'}</button>
        {settings && <button type="button" className="quiet" onClick={() => setSettings(false)}>Close choices</button>}
      </div>
      {storageError && <p role="alert">{storageError}</p>}
    </section>}
  </>;
}
