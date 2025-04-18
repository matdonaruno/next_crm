import { createClient } from '@supabase/supabase-js';
import Cookies from 'js-cookie';

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

// 環境変数の確認
const isProduction = process.env.NODE_ENV === 'production';

// クッキーベースのストレージアダプタ
const cookieStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    const value = Cookies.get(key);
    return value || null;
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    // セキュアなクッキーを設定
    Cookies.set(key, value, {
      expires: 7, // 7日間有効
      secure: process.env.NODE_ENV === 'production', // 本番環境ではHTTPSのみ
      sameSite: 'lax', // PKCEフローとの互換性のためlaxに変更
      path: '/' // すべてのパスで利用可能
    });
    console.log(`クッキーを設定しました: ${key}`);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    Cookies.remove(key, { path: '/' });
    console.log(`クッキーを削除しました: ${key}`);
  }
};

// セッションストレージの初期化
const initStorage = () => {
  if (typeof window === 'undefined') return cookieStorage;

  try {
    // 古いセッションキーを削除
    const oldKey = 'supabase.auth.token';
    if (localStorage.getItem(oldKey)) {
      console.log("古いトークンキーをローカルストレージから削除します");
      localStorage.removeItem(oldKey);
    }
    
    // 古いクッキーを削除
    if (Cookies.get(oldKey)) {
      console.log("古いトークンキーをクッキーから削除します");
      Cookies.remove(oldKey, { path: '/' });
    }
    
    // 現在のセッションキーをローカルストレージからクッキーに移行
    const currentSession = localStorage.getItem(storageKey);
    if (currentSession) {
      console.log("既存のセッションをローカルストレージからクッキーに移行します");
      try {
        const sessionData = JSON.parse(currentSession);
        Cookies.set(storageKey, currentSession, {
          expires: 7,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', // PKCEフローとの互換性のためlaxに変更
          path: '/'
        });
        // 移行後にローカルストレージから削除
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.error("セッションデータの解析に失敗しました:", e);
      }
    }
    
    // 現在のクッキーを確認
    const cookieSession = Cookies.get(storageKey);
    if (cookieSession) {
      console.log("既存のクッキーセッションが見つかりました");
    }
  } catch (e) {
    console.error("ストレージアクセスエラー:", e);
  }
  
  return cookieStorage;
};

// クライアントを作成
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // デフォルトでtrue
    storageKey: storageKey, // デフォルトのキー名を使用
    storage: cookieStorage,
    autoRefreshToken: true,
    debug: !isProduction,
    flowType: 'pkce',
  },
  global: {
    fetch: fetch.bind(globalThis),
  },
});

console.log("Supabaseクライアント初期化完了 - storageKey:", storageKey, 
  "timeout:", 5000, "flowType:", 'pkce');

// セッションチェック
setTimeout(() => {
  supabaseClient.auth.getSession().then(({ data, error }) => {
    console.log("セッションチェック - セッション存在:", !!data.session, 
      "エラー:", error ? error.message : "なし", 
      "ユーザーID:", data.session?.user?.id ?? "なし");
  });
}, 1000);

// visibility changeイベントリスナーを無効化
// Supabaseが自動的にトークンを更新するためのリスナーをdelete documentで一度削除してから
// ダミーのリスナーを追加して別のリスナーが追加されないようにする
if (typeof window !== 'undefined') {
  try {
    const orgAddEventListener = window.document.addEventListener;
    window.document.addEventListener = function(
      event: string, 
      fn: EventListenerOrEventListenerObject, 
      ...args: any[]
    ) {
      if (event === 'visibilitychange') {
        console.log("visibilitychangeイベントリスナー追加をブロックしました");
        // 呼び出しをブロック
        return orgAddEventListener.call(this, 'DummyVisibilityEvent', function() {}, ...args);
      }
      return orgAddEventListener.call(this, event, fn, ...args);
    };
  } catch (e) {
    console.error("visibilitychangeイベントリスナーのオーバーライドに失敗:", e);
  }
}

// デフォルトエクスポートを追加
export default supabaseClient;
export { supabaseClient };
