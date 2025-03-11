import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Supabase URLからプロジェクトIDを抽出
const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'bsgvaomswzkywbiubtjg';
const storageKey = `sb-${projectId}-auth-token`; // Supabaseのデフォルト形式

console.log("Supabase設定:", { 
  url: supabaseUrl ? "設定あり" : "未設定", 
  key: supabaseAnonKey ? "設定あり" : "未設定",
  storageKey
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase環境変数が設定されていません");
}

// Supabaseクライアントの設定
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: storageKey, // デフォルトキーを使用
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    debug: process.env.NODE_ENV === 'development' // 開発環境のみデバッグ有効
  }
});

// デバッグ用：Supabaseクライアントの初期化確認
console.log("Supabaseクライアントを初期化しました", { storageKey });

// セッションの確認
if (typeof window !== 'undefined') {
  setTimeout(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      console.log("現在のセッション状態:", { 
        session: data.session ? "あり" : "なし", 
        error: error?.message || "なし" 
      });
    } catch (e) {
      console.error("セッション確認エラー:", e);
    }
  }, 1000);
}
