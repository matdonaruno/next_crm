/* eslint @typescript-eslint/consistent-type-imports: "off" */
'use client';

import { SessionContextProvider, useSessionContext, useSupabaseClient } from '@supabase/auth-helpers-react';
import { createBrowserClient } from '@supabase/ssr';
import type { Session } from '@supabase/supabase-js';
import React, { useMemo } from 'react';
import type { Database } from '@/types/supabase';

/**
 * 簡易的な invariant ヘルパー（外部依存を避けるため自前実装）。
 * 条件が偽の場合は Error を投げて処理を停止します。
 */
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Supabase のブラウザクライアントとセッションコンテキストを
 * 下位コンポーネントに提供する Provider コンポーネント。
 *
 * SupabaseClient インスタンスは **クライアント側** で生成することで、
 * Server Component から Client Component へ複雑なオブジェクトを
 * 直接渡す際に発生する
 * 「Only plain objects can be passed…」エラーを回避します。
 */
export function SupabaseProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  /** サーバーで取得したセッション（`null` の可能性あり） */
  initialSession: Session | null;
}) {
  // --------- Grab env vars & validate ----------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NODE_ENV !== 'production') {
    invariant(url, 'NEXT_PUBLIC_SUPABASE_URL is not set');
    invariant(anon, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  }

  // --------- ブラウザクライアントをグローバルキャッシュ（一つの WS 接続を再利用） ----------
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null as never; // should never happen on server
    // cache in globalThis to survive React remounts
    const cacheKey = '__SUPABASE_BROWSER_CLIENT__';
    const existing = (globalThis as any)[cacheKey] as ReturnType<
      typeof createBrowserClient<Database>
    > | null;
    if (existing) return existing;
    const client = createBrowserClient<Database>(url!, anon!);
    (globalThis as any)[cacheKey] = client;
    return client;
  }, [url, anon]);

  return (
    <SessionContextProvider
      supabaseClient={supabase}
      initialSession={initialSession}
    >
      {children}
    </SessionContextProvider>
  );
}

/**
 * Supabase クライアントと現在のセッションを取得するカスタムフック。
 * 常に型付けされた `supabase` が返るため、undefined チェック不要。
 */
export function useSupabase() {
  const supabase = useSupabaseClient<Database>();
  const { session } = useSessionContext();
  return { supabase, session };
}