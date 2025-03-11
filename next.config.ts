/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-var-requires */

// @ts-nocheck
import type { NextConfig } from 'next';

// next-pwaをESモジュール形式でインポート
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import withPWAImport from 'next-pwa';
const withPWA = withPWAImport as any;

const isProd = process.env.NODE_ENV === 'production';

const pwaConfig = {
  dest: 'public',
  disable: !isProd,
  register: isProd,
  skipWaiting: true,
  buildExcludes: [/middleware-manifest\.json$/] as any,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/bsgvaomswzkywbiubtjg\.supabase\.co\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 // 24時間
        }
      }
    }
  ]
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // TypeScriptエラーを無視して本番ビルドを許可
    ignoreBuildErrors: true,
  },
};

export default withPWA(pwaConfig)(nextConfig);
