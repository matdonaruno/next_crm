// @ts-ignore
import withPWA from 'next-pwa';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig = withPWA({
  dest: 'public',
  disable: !isProd,
  register: isProd,
  skipWaiting: true,
})({
  reactStrictMode: true,
});

export default nextConfig;
