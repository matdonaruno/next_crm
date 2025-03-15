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

// Supabaseクライアントの設定
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: storageKey,
    storage: initStorage(),
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce', // PKCEフローを使用（より安全）
    debug: process.env.NODE_ENV === 'development' // 開発環境のみデバッグ有効
  },
  global: {
    // リクエストのタイムアウト設定（5秒に短縮）
    fetch: (url, options) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒タイムアウト
      
      return fetch(url, {
        ...options,
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
    }
  },
  db: {
    schema: 'public'
  }
});

// デバッグ用：Supabaseクライアントの初期化確認
console.log("Supabaseクライアントを初期化しました", { 
  storageKey,
  timeout: "5秒",
  flowType: "pkce",
  storage: "cookie-based"
});

// セッションの確認
if (typeof window !== 'undefined') {
  setTimeout(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      console.log("現在のセッション状態:", { 
        session: data.session ? "あり" : "なし", 
        error: error?.message || "なし",
        userId: data.session?.user?.id || "なし",
        cookieExists: !!Cookies.get(storageKey)
      });
    } catch (e) {
      console.error("セッション確認エラー:", e);
    }
  }, 1000);
}
