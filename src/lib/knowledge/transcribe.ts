import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { ProviderError } from '../model/provider';

export interface TranscriptionInput { audio: Uint8Array; mimeType: string; fileName: string; }
export interface Transcription { text: string; inputTokens: number; outputTokens: number; costMicros: number; }
/** Turns a recording into text. Spend is reserved by the caller from reserveMicros before transcribe runs. */
export interface Transcriber {
  /** The most this recording can cost. Throws TRANSCRIPTION_UNAVAILABLE when transcription is not set up. */
  reserveMicros(sizeBytes: number): number;
  transcribe(input: TranscriptionInput): Promise<Transcription>;
}
/** A failure whose provider cost is known, so the reservation is reconciled to it. */
export class TranscriptionError extends AppError {
  constructor(code: string, message: string, public readonly costMicros?: number) { super(code, message, 422); }
}
export const tooLong = (costMicros?: number) => new TranscriptionError('RECORDING_TOO_LONG', 'Recording too long: split it into shorter parts', costMicros);

// The transcription call has its own deadline inside the processing route's 300 seconds.
const DEADLINE_MS = 240_000;
// The reservation assumes the slowest likely bitrate, 16 kbps, and Gemini's 32 audio tokens a second.
const AUDIO_BYTES_PER_SECOND = 16_000 / 8;
const AUDIO_TOKENS_PER_SECOND = 32;
const instruction = 'Transcribe this recording verbatim, in the language spoken. Return only the words spoken, with a blank line where the speaker moves to a new point. Do not summarise, translate, correct, add headings, timestamps or speaker labels, or comment on the recording. Return nothing if there is no speech.';

interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/** One native generateContent call with the audio inline. Always Gemini, whatever the chat provider. */
export class GeminiTranscriber implements Transcriber {
  /** About an hour of speech; a longer recording stops at this cap and is reported as too long. */
  readonly maxOutputTokens = 32_768;
  constructor(private config: RuntimeConfig, private fetcher: typeof fetch = fetch) { if (typeof window !== 'undefined') throw new Error('Transcription is server-only.'); }
  private prices(): { input: number; output: number } {
    const { transcriptionApiKey, transcriptionInputUsdPerMillion: input, transcriptionOutputUsdPerMillion: output } = this.config;
    const missing = [!transcriptionApiKey && 'DEVILS_GEMINI_API_KEY', input === undefined && 'DEVILS_TRANSCRIPTION_INPUT_USD_PER_MILLION', output === undefined && 'DEVILS_TRANSCRIPTION_OUTPUT_USD_PER_MILLION'].filter(Boolean);
    if (missing.length) throw new AppError('TRANSCRIPTION_UNAVAILABLE', `Transcription isn't set up: set ${missing.join(' and ')}.`, 503);
    return { input: input!, output: output! };
  }
  reserveMicros(sizeBytes: number): number {
    const prices = this.prices();
    return Math.ceil(sizeBytes / AUDIO_BYTES_PER_SECOND * AUDIO_TOKENS_PER_SECOND * prices.input + this.maxOutputTokens * prices.output);
  }
  async transcribe({ audio, mimeType }: TranscriptionInput): Promise<Transcription> {
    const prices = this.prices(); const model = this.config.transcriptionModel;
    const thinking = /^gemini-2\.5-/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : /^gemini-3[.-]/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    let body: GeminiResponse;
    try {
      let response: Response;
      try {
        response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: controller.signal, headers: { 'x-goog-api-key': this.config.transcriptionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: instruction }, { inlineData: { mimeType, data: Buffer.from(audio).toString('base64') } }] }], generationConfig: { candidateCount: 1, maxOutputTokens: this.maxOutputTokens, ...thinking } }),
        });
      } catch { if (controller.signal.aborted) throw tooLong(); throw new ProviderError(true, 'Transcription could not complete. Try again.'); }
      if (!response.ok) throw response.status === 429 || response.status >= 500 ? new ProviderError(true, 'Transcription could not complete. Try again.') : new ProviderError(false, 'The transcription service rejected this recording.');
      try { body = await response.json() as GeminiResponse; } catch { if (controller.signal.aborted) throw tooLong(); throw new ProviderError(false, 'The transcription service returned an invalid response.'); }
    } finally { clearTimeout(timer); }
    const candidate = body?.candidates?.[0]; const blocked = Boolean(body?.promptFeedback?.blockReason) || Boolean(candidate?.finishReason && candidate.finishReason !== 'STOP');
    const usage = body?.usageMetadata; const inputTokens = usage?.promptTokenCount; const candidateTokens = usage?.candidatesTokenCount ?? (blocked ? 0 : undefined); const thoughtTokens = usage?.thoughtsTokenCount ?? 0;
    if (![inputTokens, candidateTokens, thoughtTokens].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) throw new ProviderError(false, 'Provider usage was missing or invalid.');
    const outputTokens = candidateTokens! + thoughtTokens;
    const costMicros = Math.ceil(inputTokens! * prices.input + outputTokens * prices.output);
    if (candidate?.finishReason === 'MAX_TOKENS') throw tooLong(costMicros);
    if (blocked || candidate?.finishReason !== 'STOP') throw new TranscriptionError('TRANSCRIPTION_DECLINED', 'The transcription service declined this recording.', costMicros);
    const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('') ?? '';
    return { text, inputTokens: inputTokens!, outputTokens, costMicros };
  }
}

/** Local mode never calls a provider: every recording gets the same sentence plus its file name. */
export class DeterministicTranscriber implements Transcriber {
  reserveMicros(): number { return 0; }
  async transcribe({ fileName }: TranscriptionInput): Promise<Transcription> {
    return { text: `Local transcript of ${fileName}. Ask what the customer pays today to live with the problem.`, inputTokens: 0, outputTokens: 0, costMicros: 0 };
  }
}

export function createTranscriber(config: RuntimeConfig, fetcher: typeof fetch = fetch): Transcriber {
  return config.mode === 'local' ? new DeterministicTranscriber() : new GeminiTranscriber(config, fetcher);
}
