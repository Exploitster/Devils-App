'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, AuthData, ErrorNotice, Shell } from '@/components/app';
export default function Login() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [local, setLocal] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => { api<AuthData>('/api/auth').then(data => setLocal(data.config.runtimeMode === 'local')).catch(() => setError('Unable to check sign-in configuration. Reload to try again.')); }, []);
    return <Shell>
      <section className="panel narrow">
      <p className="eyebrow">Welcome back</p>
      <h1>Room to reconsider.</h1>
      <p>Sign in with your invited email address. Public registration is closed.</p>{local && <div className="notice">
      <strong>Local development · deterministic AI · no email/payment sent</strong>
      <p>Use a local demo account:</p>
      <div className="actions">{['alex@example.test', 'sam@example.test', 'expired@example.test'].map(value => <button key={value} onClick={() => setEmail(value)}>{value}</button>)}</div>
      </div>}<form onSubmit={async (event) => { event.preventDefault(); setPending(true); setError(''); try {
        const data = await api<{
            message: string;
        }>('/api/auth', 'POST', { email });
        if ((await api<AuthData>('/api/auth')).user)
            router.push('/home');
        else
            setMessage(data.message ?? 'If this address has an invitation, check your email for a sign-in link.');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setPending(false);
    } }}>
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required/>
      <button className="primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>{message && <p role="status">{message}</p>}{error && <ErrorNotice error={error}/>}</section>
      </Shell>;
}
