import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// クライアント側のSupabaseクライアント作成関数
export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 本番環境ではデバッグログを無効化
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isDebugMode = isDevelopment && 
    typeof window !== 'undefined' && 
    new URLSearchParams(window.location.search).has('debug');

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      debug: isDebugMode, // デバッグモードが有効な場合のみデバッグログを出力
      storageKey: 'sb-bsgvaomswzkywbiubtjg-auth-token',
      flowType: 'pkce',
    }
  });
}; 