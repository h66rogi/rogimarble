import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@rogimarble/overlay-ui', '@rogimarble/animation', '@rogimarble/asset-manifest'],
};

export default config;
