import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// サーバー側のSupabaseクライアント作成関数（Route Handlers用）
export const createClient = (cookieStore: ReturnType<typeof cookies>) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabaseの環境変数が設定されていません');
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      async get(name: string) {
        const cookieValues = await cookieStore;
        return cookieValues.get(name)?.value;
      },
      async set(name: string, value: string, options: any) {
        try {
          const cookieValues = await cookieStore;
          cookieValues.set({ name, value, ...options });
        } catch (error) {
          console.error('Cookie設定エラー:', error);
        }
      },
      async remove(name: string, options: any) {
        try {
          const cookieValues = await cookieStore;
          cookieValues.set({ name, value: '', ...options });
        } catch (error) {
          console.error('Cookie削除エラー:', error);
        }
      },
    },
  });
}; 