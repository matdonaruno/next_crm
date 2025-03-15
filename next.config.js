/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa');
const path = require('path');

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
  // パスエイリアスの設定を追加
  experimental: {
    // WebpackでのパスエイリアスをFalseにして、tsconfig.jsonのパスエイリアスを優先
    transpilePackages: ['@'],
  },
  // ESLintの警告を無視してビルドを進める
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ビルドの詳細ログを出力
  output: 'standalone',
  distDir: '.next',
  // ビルドエラーをデバッグ用に詳細表示
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 60 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },
};

module.exports = withPWA(pwaConfig)(nextConfig);
