import type { NextConfig } from 'next';
const config: NextConfig = { agentRules: false, poweredByHeader: false, reactStrictMode: true, devIndicators: false, logging: { incomingRequests: false } };
export default config;
