import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// サーバー側のSupabaseクライアント作成関数（Route Handlers用）
export const createClient = async (cookieStore = cookies()) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabaseの環境変数が設定されていません');
  }

  // 本番環境ではデバッグログを無効化
  const isDevelopment = process.env.NODE_ENV === 'development';
  // 環境変数でデバッグモードを制御（サーバー側ではURLパラメータが使えないため）
  const isDebugMode = isDevelopment && process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';
  
  // cookieStore Promiseを先に解決しておく
  const resolvedCookieStore = await cookieStore;
  
  const cookiesHandler = {
    get(name: string) {
      return resolvedCookieStore.get(name)?.value;
    },
    set(name: string, value: string, options: any) {
      try {
        resolvedCookieStore.set({ name, value, ...options });
      } catch (error) {
        // エラーメッセージはデバッグモードのみ表示
        if (isDebugMode) {
          console.error('Cookie設定エラー:', error);
        }
      }
    },
    remove(name: string, options: any) {
      try {
        resolvedCookieStore.set({ name, value: '', ...options });
      } catch (error) {
        // エラーメッセージはデバッグモードのみ表示
        if (isDebugMode) {
          console.error('Cookie削除エラー:', error);
        }
      }
    },
  };

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: cookiesHandler,
    auth: {
      debug: isDebugMode, // デバッグモードが有効な場合のみデバッグログを出力
    }
  });
}; 