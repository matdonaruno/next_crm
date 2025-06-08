/** @type {import('next').NextConfig} */
const NextPWA = require('next-pwa');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const withPWA = NextPWA;

const pwaConfig = {
  dest: 'public',
  disable: !isProd,
  register: true,
  skipWaiting: true,
  publicExcludes: [], // publicディレクトリの内容を除外しないように設定
  buildExcludes: [/middleware-manifest\.json$/],
  sw: 'sw.js',
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
    },
    {
      urlPattern: /\/_next\/image\?url=.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-image',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30日
        },
      },
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-font-assets',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1年
        },
      },
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-image-assets',
        expiration: {
          maxEntries: 150,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30日
        },
      },
    },
    {
      urlPattern: /\.(?:js)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-js-assets',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7日
        },
      },
    },
    {
      urlPattern: /\.(?:css|less)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-style-assets',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7日
        },
      },
    },
    {
      urlPattern: /.*\.json/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'json-cache',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24, // 24時間
        },
      },
    },
    {
      urlPattern: /.*$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'others',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24, // 24時間
        },
        networkTimeoutSeconds: 10,
      },
    },
  ]
};

const nextConfig = {
  reactStrictMode: false,
  typescript: {
    // TypeScriptエラーを無視して本番ビルドを許可
    ignoreBuildErrors: true,
  },
  // 静的ファイルの設定
  images: {
    unoptimized: true, // 画像最適化を無効化
  },
  // パスエイリアスの設定を追加
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
  // ESLintの警告を無視してビルドを進める
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Vercel環境ではoutputモードを設定
  ...(isVercel ? {} : { output: 'standalone' }),
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
