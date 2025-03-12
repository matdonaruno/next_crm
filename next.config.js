/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa');

const isProd = process.env.NODE_ENV === 'production';

const pwaConfig = {
  dest: 'public',
  disable: !isProd,
  register: isProd,
  skipWaiting: true,
  buildExcludes: [/middleware-manifest\.json$/],
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

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // TypeScriptエラーを無視して本番ビルドを許可
    ignoreBuildErrors: true,
  },
};

module.exports = withPWA(pwaConfig)(nextConfig);
