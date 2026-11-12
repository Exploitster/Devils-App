'use client';
import { useEffect, useState } from 'react';
import { api, ErrorNotice } from '@/components/app';
import type { ModelConnection } from '@/lib/model-keys/service';
import type { ModelKeyProvider } from '@/lib/model-keys/store';

interface OwnAi { available: boolean; connection: ModelConnection | null; }
const providers: Record<ModelKeyProvider, { label: string; keysUrl: string; keysSite: string }> = {
  anthropic: { label: 'Claude (Anthropic)', keysUrl: 'https://console.anthropic.com/settings/keys', keysSite: 'console.anthropic.com' },
  openai: { label: 'ChatGPT models (OpenAI)', keysUrl: 'https://platform.openai.com/api-keys', keysSite: 'platform.openai.com' },
};

/** Account panel for connecting a person's own Claude or OpenAI API key. The key is sent once and never shown again. */
export function OwnAiPanel() {
  const [state, setState] = useState<OwnAi>(); const [models, setModels] = useState<string[]>([]);
  const [provider, setProvider] = useState<ModelKeyProvider>('anthropic'); const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const [error, setError] = useState('');
  useEffect(() => { api<OwnAi>('/api/account/model-key').then(setState).catch((e: Error) => setError(e.message)); }, []);
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); setStatus(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const connection = state?.connection;
  if (!state) return <section className="panel"><h2>Your own AI</h2>{error ? <ErrorNotice error={error}/> : <p role="status" className="fine">Loading…</p>}</section>;
  return <section className="panel"><h2>Your own AI</h2>
    <p>Connect your own Claude or OpenAI API key and your conversations run on your account, without the shared daily allowance. Your provider bills you for what you use.</p>
    {error && <ErrorNotice error={error}/>}
    {!state.available ? <p className="fine" role="status">Connecting your own AI is not available yet.</p>
    : connection ? <>
      <div className="setting-row"><div><strong>{providers[connection.provider].label}</strong><p>{connection.needsReconnect ? 'Your saved key can no longer be read. Remove it and connect it again.' : `Connected. Key ending ${connection.last4}.`}</p></div>
        <button className="small danger" disabled={busy} onClick={() => run(async () => { await api('/api/account/model-key', 'DELETE'); setState({ available: true, connection: null }); setModels([]); setStatus('Your key has been removed. Conversations use the shared AI again.'); })}>Remove key</button></div>
      {!connection.needsReconnect && <div className="setting-row"><div><label htmlFor="own-ai-model"><strong>Model</strong></label><p>Bigger models answer better and cost more on your account.</p></div>
        <select id="own-ai-model" value={connection.model} disabled={busy} onFocus={() => { if (!models.length) void run(async () => { setModels((await api<{ models: string[] }>('/api/account/model-key/models')).models); }); }}
          onChange={event => run(async () => { const { connection: updated } = await api<{ connection: ModelConnection }>('/api/account/model-key', 'PATCH', { model: event.target.value }); setState({ available: true, connection: updated }); setStatus('Model updated.'); })}>
          {(models.includes(connection.model) ? models : [connection.model, ...models]).map(id => <option key={id} value={id}>{id}</option>)}
        </select></div>}
    </> : <form onSubmit={event => { event.preventDefault(); void run(async () => { const saved = await api<{ connection: ModelConnection; models: string[] }>('/api/account/model-key', 'PUT', { provider, apiKey: apiKey.trim() }); setState({ available: true, connection: saved.connection }); setModels(saved.models); setApiKey(''); setStatus('Your key is connected. New messages run on your account.'); }); }}>
      <label htmlFor="own-ai-provider">Provider</label>
      <select id="own-ai-provider" value={provider} disabled={busy} onChange={event => setProvider(event.target.value as ModelKeyProvider)}>{Object.entries(providers).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select>
      <label htmlFor="own-ai-key">API key</label>
      <input id="own-ai-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} minLength={20} maxLength={300} required placeholder="Paste your API key"/>
      <p className="fine">Create a key at <a href={providers[provider].keysUrl} target="_blank" rel="noreferrer">{providers[provider].keysSite}</a>. An API key is separate from a Claude or ChatGPT subscription: it needs its own credit with the provider.</p>
      <button className="primary small" disabled={busy || apiKey.trim().length < 20}>{busy ? 'Checking…' : 'Connect key'}</button>
    </form>}
    <p className="fine" role="status">{status}</p>
    <p className="fine" style={{ marginBottom: 0 }}>Your key is stored encrypted and is never shown again. With your own key, your conversations go to that provider under your account and its terms.</p>
  </section>;
}
