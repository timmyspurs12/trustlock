import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // TrustLock Phase 1: nothing exotic required. The `pg` driver is bundled
  // for the Node.js server runtime only (API routes + server components).
};

export default nextConfig;
