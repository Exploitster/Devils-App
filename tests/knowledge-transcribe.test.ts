import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/lib/config';
import { DeterministicTranscriber, GeminiTranscriber, createTranscriber, type Transcriber } from '../src/lib/knowledge/transcribe';

const local = readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32) });
const services = { ...local, mode: 'services' as const, transcriptionModel: 'gemini-3.8-flash', transcriptionApiKey: 'private-key', transcriptionInputUsdPerMillion: 1, transcriptionOutputUsdPerMillion: 4, modelInputUsdPerMillion: 1000, modelOutputUsdPerMillion: 1000 };
const audio = { audio: new Uint8Array([1, 2, 3, 4]), mimeType: 'audio/mpeg', fileName: 'memo.mp3' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const usageMetadata = { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50 };
afterEach(() => { vi.useRealTimers(); });

describe('Gemini transcription', () => {
  it('sends the audio inline with a verbatim instruction and prices the reported usage with the transcription rates', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const transcriber = new GeminiTranscriber(services, async (url, init) => { sent = { url: String(url), init: init! }; return reply({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'thinking' }, { text: 'We charge ' }, { text: 'by the month.' }] } }], usageMetadata }); });
    expect(await transcriber.transcribe(audio)).toEqual({ text: 'We charge by the month.', inputTokens: 1000, outputTokens: 250, costMicros: 1000 * 1 + 250 * 4 });
    expect(sent!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(new Headers(sent!.init.headers).get('x-goog-api-key')).toBe('private-key');
    const body = JSON.parse(sent!.init.body as string);
    expect(body.contents[0].parts[0].text).toMatch(/verbatim/i);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'audio/mpeg', data: Buffer.from([1, 2, 3, 4]).toString('base64') } });
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(20000);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });
  it('reserves the estimated audio tokens at the audio rate plus the output cap at the output rate', () => {
    const transcriber = new GeminiTranscriber(services, fetch);
    // 16 kbps is 2,000 bytes a second; Gemini counts 32 tokens a second of audio.
    const seconds = 50 * 1024 * 1024 / 2000;
    expect(transcriber.reserveMicros(50 * 1024 * 1024)).toBe(Math.ceil(seconds * 32 * 1 + transcriber.maxOutputTokens * 4));
  });
  it('says plainly which setting is missing, naming the key or the prices', () => {
    expect(() => new GeminiTranscriber({ ...services, transcriptionApiKey: '' }, fetch).reserveMicros(10)).toThrow(expect.objectContaining({ code: 'TRANSCRIPTION_UNAVAILABLE', status: 503, message: expect.stringMatching(/^Transcription isn't set up.*DEVILS_GEMINI_API_KEY/) }));
    expect(() => new GeminiTranscriber({ ...services, transcriptionOutputUsdPerMillion: undefined }, fetch).reserveMicros(10)).toThrow(expect.objectContaining({ code: 'TRANSCRIPTION_UNAVAILABLE', message: expect.stringContaining('DEVILS_TRANSCRIPTION_OUTPUT_USD_PER_MILLION') }));
  });
  it('fails a transcript cut off at the output cap as too long, with its known cost', async () => {
    const transcriber = new GeminiTranscriber(services, async () => reply({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }], usageMetadata }));
    await expect(transcriber.transcribe(audio)).rejects.toMatchObject({ code: 'RECORDING_TOO_LONG', message: 'Recording too long: split it into shorter parts', costMicros: 2000 });
  });
  it('gives up at its own deadline as too long', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let signal: AbortSignal | undefined;
    const transcriber = new GeminiTranscriber(services, (_url, init) => new Promise((_resolve, reject) => { signal = init!.signal!; signal.addEventListener('abort', () => reject(signal!.reason)); }));
    const result = expect(transcriber.transcribe(audio)).rejects.toMatchObject({ code: 'RECORDING_TOO_LONG', message: 'Recording too long: split it into shorter parts' });
    await vi.advanceTimersByTimeAsync(239_000); expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000); expect(signal!.aborted).toBe(true);
    await result;
  });
  it.each([[503, true], [429, true], [400, false]])('maps HTTP %s to a provider error that is transient: %s', async (status, transient) => {
    const transcriber = new GeminiTranscriber(services, async () => new Response('provider diagnostic', { status }));
    await expect(transcriber.transcribe(audio)).rejects.toMatchObject({ code: 'PROVIDER_ERROR', transient });
  });
  it('uses the fixed local transcript in local mode and Gemini in services mode', async () => {
    expect(createTranscriber(local)).toBeInstanceOf(DeterministicTranscriber);
    expect(createTranscriber(services)).toBeInstanceOf(GeminiTranscriber);
    const result = await new DeterministicTranscriber().transcribe(audio);
    expect(result).toMatchObject({ costMicros: 0 }); expect(result.text).toContain('memo.mp3');
    const deterministic: Transcriber = new DeterministicTranscriber(); expect(deterministic.reserveMicros(1000)).toBe(0);
  });
});
