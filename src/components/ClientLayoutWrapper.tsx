'use client';

import { ClientTokenCleaner } from '@/components/ClientTokenCleaner';
import LoadingUI from '@/components/LoadingUI';
import { PageTransition } from '@/components/PageTransition';
import { Toaster } from '@/components/ui/toaster';
import { usePathname } from 'next/navigation';
import React from 'react';

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // ルートパスと/departページでは、グローバルなLoadingUIを表示しない
  const hideGlobalLoading = pathname === '/' || pathname === '/depart';

  return (
    <>
      <ClientTokenCleaner />
      {!hideGlobalLoading && <LoadingUI />}
      <PageTransition>{children}</PageTransition>
      <Toaster />
    </>
  );
}
