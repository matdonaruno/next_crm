import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * サーバーサイドでSupabaseクライアントを作成するユーティリティ関数
 * Next.js App Routerのサーバーコンポーネントやルートハンドラーで使用します
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase環境変数が設定されていません');
    throw new Error('Supabase環境変数が設定されていません');
  }

  console.log('Supabase設定:', {
    url: supabaseUrl ? '設定あり' : '未設定',
    key: supabaseKey ? '設定あり' : '未設定',
    storageKey: 'sb-bsgvaomswzkywbiubtjg-auth-token'
  });
  
  // クライアントの初期化
  const supabase = createServerComponentClient({
    cookies,
  });
  
  console.log('Supabaseクライアントを初期化しました', {
    storageKey: 'sb-bsgvaomswzkywbiubtjg-auth-token',
    timeout: '8秒',
    flowType: 'pkce',
    storage: 'cookie-based'
  });

  return supabase;
} 