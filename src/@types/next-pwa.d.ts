declare module 'next-pwa' {
  import { NextConfig } from 'next';
  
  interface PWAConfig {
    dest?: string;
    disable?: boolean;
    register?: boolean;
    scope?: string;
    sw?: string;
    skipWaiting?: boolean;
    runtimeCaching?: any[];
    publicExcludes?: string[];
    buildExcludes?: string[] | ((path: string) => boolean)[];
    dynamicStartUrl?: boolean;
    fallbacks?: {
      document?: string;
      image?: string;
      font?: string;
      audio?: string;
      video?: string;
    };
  }
  
  type WithPWA = (config: PWAConfig) => (nextConfig: NextConfig) => NextConfig;
  
  const withPWA: WithPWA;
  
  export default withPWA;
} 