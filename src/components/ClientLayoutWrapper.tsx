'use client'; // ★ クライアントコンポーネント指定

import { AuthProvider } from "@/contexts/AuthContext";
import { ClientTokenCleaner } from "@/components/ClientTokenCleaner";
import { LoadingUI } from "@/components/LoadingUI";
import { Toaster } from "@/components/ui/toaster";
import { PageTransition } from "@/components/PageTransition";
import React from 'react';

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ClientTokenCleaner />
      <LoadingUI />
      <PageTransition>
        {children}
      </PageTransition>
      <Toaster />
    </AuthProvider>
  );
} 