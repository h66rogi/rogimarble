import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{
      source: '/:path*',
      headers: [{
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "img-src 'self' data: blob:",
          "connect-src 'self' https://marble-api.rogi.chat",
          "media-src 'self' blob:",
          "worker-src 'self' blob:",
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      }],
    }];
  },
  transpilePackages: ['@rogimarble/overlay-ui', '@rogimarble/animation', '@rogimarble/asset-manifest'],
};

export default config;
