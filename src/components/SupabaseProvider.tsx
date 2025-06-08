// src/components/SupabaseProvider.tsx
'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase のブラウザクライアントをアプリ全体に供給するための
 * コンテキスト & プロバイダーです。
 *
 * - `SupabaseProvider` でツリーをラップ
 * - どこでも `useSupabase()` で同一クライアントを取得
 */
const SupabaseContext = createContext<SupabaseClient | undefined>(undefined);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  //  1インスタンスだけ生成。キーが変わらない限り useMemo で再生成しない
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
}

/**
 * Supabase クライアントを取得するカスタムフック。
 * Provider 配下以外で呼び出すとエラーを投げます。
 */
export function useSupabase(): SupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) {
    throw new Error('useSupabase must be used within <SupabaseProvider>');
  }
  return client;
}

// デフォルトエクスポートも維持しておくと import の互換性が高まる
export default SupabaseProvider;