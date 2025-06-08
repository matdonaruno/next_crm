'use client';

import { ReactNode } from 'react';
import { SupabaseProvider } from './SupabaseProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SupabaseProvider>
      {children}
    </SupabaseProvider>
  );
}