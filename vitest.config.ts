import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { env: { DEVILS_DEPLOYMENT_ENV: '', DEVILS_SHARED_DATA_REHEARSAL: 'false' }, environment: 'node', include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**'], testTimeout: 10000 } });
