import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readConfig } from '../src/lib/config';
import { GeminiTranscriber } from '../src/lib/knowledge/transcribe';
import { resolveFileType } from '../src/lib/knowledge/service';
import { FILE_LIMIT_BYTES } from '../src/lib/knowledge/files';

// Owner-run live check that Gemini accepts the recording formats the Studio takes, sent
// inline exactly as the Studio sends them. Transcripts are not printed or saved, only their length and cost.
const args = process.argv.slice(2);
if (!args.includes('--confirm-live')) throw new Error('Add --confirm-live and the paths of your sample recordings to permit live, billed Gemini transcription requests.');
const paths = args.filter(arg => arg !== '--confirm-live');
if (!paths.length) throw new Error('Pass the paths of the recordings to check, for example a .webm, a .m4a and one near 50 MB.');
try { process.loadEnvFile('.env.local'); } catch {}
// Only the transcription settings matter here; the chat provider is pinned so its own settings are not required.
const config = readConfig({ ...process.env, NODE_ENV: 'test', DEVILS_RUNTIME_MODE: 'services', DEVILS_MODEL_PROVIDER: 'gateway', DEVILS_PAYMENTS_ENABLED: 'false', DEVILS_SUPABASE_URL: 'https://synthetic.invalid', DEVILS_SUPABASE_ANON_KEY: 'unused-synthetic', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'unused-synthetic', DEVILS_APP_URL: 'https://synthetic.invalid' });
const transcriber = new GeminiTranscriber(config);

const files = paths.map(path => { const bytes = new Uint8Array(readFileSync(path)); const type = resolveFileType(basename(path), ''); return { name: basename(path), bytes, mimeType: type?.kind === 'audio' ? type.mimeType : undefined }; });
for (const file of files) {
  if (!file.mimeType) throw new Error(`${file.name}: not a recording format the Studio accepts (MP3, M4A, MP4, WAV, WebM, OGG or FLAC).`);
  if (file.bytes.byteLength > FILE_LIMIT_BYTES) throw new Error(`${file.name}: over the Studio's 50 MB limit.`);
}
const maximumMicros = files.reduce((sum, file) => sum + transcriber.reserveMicros(file.bytes.byteLength), 0);
console.log(`Model ${config.transcriptionModel}. ${files.length} recording(s); maximum estimated spend $${(maximumMicros / 1_000_000).toFixed(2)}.`);

const report: { model: string; maximumEstimatedSpendUsd: number; passed: boolean; checks: { file: string; mimeType: string; sizeBytes: number; passed: boolean; code?: string; words?: number; costMicros?: number; elapsedMs: number }[] } = { model: config.transcriptionModel, maximumEstimatedSpendUsd: maximumMicros / 1_000_000, passed: false, checks: [] };
try {
  for (const file of files) {
    const started = Date.now();
    try {
      const result = await transcriber.transcribe({ audio: file.bytes, mimeType: file.mimeType!, fileName: file.name });
      const words = result.text.split(/\s+/).filter(Boolean).length;
      report.checks.push({ file: file.name, mimeType: file.mimeType!, sizeBytes: file.bytes.byteLength, passed: words > 0, ...(words > 0 ? {} : { code: 'EMPTY_TRANSCRIPT' }), words, costMicros: result.costMicros, elapsedMs: Date.now() - started });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'CHECK_FAILED';
      report.checks.push({ file: file.name, mimeType: file.mimeType!, sizeBytes: file.bytes.byteLength, passed: false, code, ...(error && typeof error === 'object' && 'costMicros' in error && typeof error.costMicros === 'number' ? { costMicros: error.costMicros } : {}), elapsedMs: Date.now() - started });
    }
    const check = report.checks.at(-1)!;
    console.log(`${check.file} (${check.mimeType}, ${(check.sizeBytes / 1_048_576).toFixed(1)} MB): ${check.passed ? `transcribed, ${check.words} words` : `failed with ${check.code}`} in ${(check.elapsedMs / 1000).toFixed(0)} s.`);
  }
  report.passed = report.checks.every(check => check.passed);
  const browserFormats = ['audio/webm', 'audio/mp4'].filter(type => report.checks.some(check => check.mimeType === type));
  if (browserFormats.length && browserFormats.every(type => report.checks.filter(check => check.mimeType === type).every(check => !check.passed && check.code === 'PROVIDER_ERROR'))) console.error('Gemini rejected every browser recording format checked (WebM, M4A). Stop and report before shipping recording uploads.');
  if (!report.passed) process.exitCode = 1;
} finally {
  mkdirSync('.local/evaluations', { recursive: true });
  const path = `.local/evaluations/transcription-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`Sanitized status: ${path}`);
}
