import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// クライアント側のSupabaseクライアント作成関数
export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabaseの環境変数が設定されていません');
  }

  return createSupabaseClient(supabaseUrl, supabaseKey);
}; 