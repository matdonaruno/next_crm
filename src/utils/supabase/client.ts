import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/**
 * ブラウザで共有する Supabase クライアント。
 * App Router の Client Component から import して使う。
 */
export const createClient = () => {
  console.log('Supabase Client 初期化開始');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 開発時のみ ?debug で詳細ログを出す
  const isDev       = process.env.NODE_ENV === 'development';
  const isDebugMode =
    isDev &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  console.log('Supabase環境チェック:', {
    isDev,
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
  });

  return createSupabaseClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      flowType: 'implicit',          // ← PKCE を無効に
      autoRefreshToken: true,
      persistSession : true,
      storageKey     : 'sb-bsgvaomswzkywbiubtjg-auth-token',
      debug          : isDebugMode,
    },
  });
};
