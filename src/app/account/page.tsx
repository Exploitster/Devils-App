'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ErrorNotice, Shell } from '@/components/app';
import type { AccessDecision, UserProfile } from '@/lib/contracts';
interface Account {
    profile: UserProfile;
    access: AccessDecision;
    privacy: Record<string, string>;
}
export default function AccountPage() { const router = useRouter(); const [account, setAccount] = useState<Account>(); const [error, setError] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const dialog = useRef<HTMLDialogElement>(null); function load() { return api<Account>('/api/account').then(data => { setAccount(data); setError(''); }).catch((e: Error) => setError(e.message)); } useEffect(() => { void load(); }, []); return <Shell>
      <p className="eyebrow">Your space</p>
      <h1>Account</h1>{error && <ErrorNotice error={error} retry={load}/>}<section className="panel">
      <h2>Profile</h2>{account ? <>
      <p>{account.profile.email}</p>
      <p>Generation access: {account.access.reason}</p>{account.profile.deletionState === 'pending' && <p role="status">Account closure is pending. Retry deletion below to finish.</p>}</> : <p role="status">Loading account…</p>}</section>
      <section className="panel">
      <h2>Privacy, in plain language</h2>
      <p>Your conversations are private through account authentication and access controls. This service does not provide end-to-end encryption.</p>{account && Object.entries(account.privacy).map(([key, value]) => <p key={key}>{value}</p>)}<p>Messages needed for generation are sent to the configured model provider. Provider retention is not guaranteed by this application. Do not include information you are not comfortable sharing with that provider.</p>
      <p>Only your theme preference is stored in this browser. Unsent messages stay in page memory and are lost when you leave or reload.</p>
      </section>
      <section className="panel">
      <h2>Delete your account</h2>
      <p>Close your account and remove your conversations, cards and saved personal data. Active billing is cancelled as part of closure. If a service is unavailable, the account is disabled and deletion can be retried.</p>
      <button className="danger" onClick={() => { setConfirmation(''); dialog.current?.showModal(); }}>Delete account</button>
      </section>
      <dialog ref={dialog} aria-labelledby="account-delete-title">
      <h2 id="account-delete-title">Permanently delete your account?</h2>
      <p>This cannot be undone. Type DELETE to confirm.</p>
      <label htmlFor="delete-confirmation">Confirmation</label>
      <input id="delete-confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/>
      <div className="actions">
      <button autoFocus onClick={() => dialog.current?.close()}>Keep account</button>
      <button className="danger" disabled={busy || confirmation !== 'DELETE'} onClick={async () => { setBusy(true); try {
    await api('/api/account', 'DELETE', { confirmation });
    router.push('/login');
}
catch (e) {
    dialog.current?.close();
    await load();
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }}>{busy ? 'Deleting…' : 'Delete account permanently'}</button>
      </div>
      </dialog>
      </Shell>; }
