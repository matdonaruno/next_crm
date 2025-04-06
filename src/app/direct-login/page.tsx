'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight } from 'lucide-react';

// クライアントサイドかどうかをチェックする関数
const isClient = () => typeof window !== 'undefined';

// クッキーを設定する関数
function setCookie(name: string, value: string, days: number = 7) {
  if (!isClient()) return;
  
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  // localhostではSameSite=Laxを使用（より互換性がある）
  // 大文字小文字が重要なので修正
  const sameSite = window.location.hostname === 'localhost' ? 'Lax' : 'None';
  const secure = window.location.hostname !== 'localhost';
  document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=" + sameSite + (secure ? "; Secure" : "");
  console.log(`クッキー設定: ${name} (${value.length}文字) SameSite=${sameSite}, Secure=${secure}`);
}

// クッキーを取得する関数
function getCookie(name: string): string | null {
  if (!isClient()) return null;
  
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith(name + '=')) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  console.log(`クッキー取得: ${name} は見つかりません`);
  return null;
}

// クッキーをすべて削除
function clearAllCookies() {
  if (!isClient()) return;
  
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
    console.log(`クッキー削除: ${name}`);
  }
  
  // 特定のパスでも試行
  cookies.forEach(cookie => {
    const name = cookie.split('=')[0].trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  });
  
  console.log("すべてのクッキーを削除しました");
  console.log("現在のクッキー: " + document.cookie);
}

// Service Workerを登録・削除する関数
async function unregisterServiceWorkers() {
  if (!isClient() || !('serviceWorker' in navigator)) return;
  
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
      console.log('ServiceWorker登録解除完了: ', registration.scope);
    }
  } catch (e) {
    console.error('ServiceWorker登録解除エラー: ', e);
  }
}

// サーバーサイドレンダリング中にuseEffectが実行されることを防ぐためのフラグ
let isMounted = false;

const DirectLoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
  useEffect(() => {
    // サーバーサイドレンダリング中は処理しない
    if (!isClient() || isMounted) return;
    
    isMounted = true;
    
    // ページ読み込み時に現在のストレージ状態をログ出力
    console.log("DirectLogin: 初期化");
    console.log("現在のクッキー: ", document.cookie);
    
    // すべてのローカルストレージキーを表示
    try {
      const localStorageKeys = Object.keys(localStorage);
      console.log("LocalStorageキー: ", localStorageKeys);
    } catch (e) {
      console.error("LocalStorage アクセスエラー:", e);
    }
    
    // すべてのセッションストレージキーを表示
    try {
      const sessionStorageKeys = Object.keys(sessionStorage);
      console.log("SessionStorageキー: ", sessionStorageKeys);
    } catch (e) {
      console.error("SessionStorage アクセスエラー:", e);
    }
    
    // ServiceWorkerをクリーンアップ
    unregisterServiceWorkers();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      console.log("DirectLogin: ログイン処理を開始");
      
      // すべてのストレージをクリア
      if (isClient()) {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          console.error("ストレージクリアエラー:", e);
        }
      }
      
      clearAllCookies();
      console.log("DirectLogin: すべてのストレージをクリア完了");
      
      // SupabaseクライアントをPKCEなしの設定で新規作成
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("環境変数が設定されていません");
      }
      
      // プロジェクトIDを抽出
      const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'bsgvaomswzkywbiubtjg';
      const storageKey = `sb-${projectId}-auth-token`;
      
      console.log("DirectLogin: クリーンなクライアントを初期化", { url: supabaseUrl, projectId, storageKey });
      
      // 特殊設定を使わない単純なクライアント - シングルトンとして1回だけ作成
      // 重複呼び出しを避けるためにuseStateやuseRefで管理するか、外部で1回だけ作るべきですが
      // このコンポーネントの特殊な用途（セッションをクリアして新規作成）のため、ここでは許容します
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'implicit'
        }
      });
      
      // 直接サインインを試行
      console.log("DirectLogin: ログインを実行", { email });
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (loginError) {
        console.error("DirectLogin: ログインエラー", loginError);
        setError(loginError.message);
        return;
      }
      
      if (!data || !data.session) {
        console.error("DirectLogin: セッションデータがありません");
        setError("ログインに成功しましたが、セッションデータがありません");
        return;
      }
      
      // 成功した場合、セッションをクッキーに保存
      console.log("DirectLogin: ログイン成功", data.user?.id);
      const session = data.session;
      
      // セッション情報をJSON文字列に変換
      const sessionStr = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: data.user
      });
      
      // セッションストレージにはJSON形式データを保存（デバッグ用）
      if (isClient()) {
        try {
          sessionStorage.setItem('debug_session', sessionStr);
          console.log("DirectLogin: セッションデータをセッションストレージに保存");
        } catch (e) {
          console.error("SessionStorage 保存エラー:", e);
        }
      }
      
      // クッキーに保存（localhostではSameSite=laxに自動設定）
      setCookie(storageKey, sessionStr, 7);
      
      // バックアップとしてローカルストレージにも保存
      if (isClient()) {
        try {
          localStorage.setItem(storageKey, sessionStr);
          console.log("DirectLogin: ローカルストレージに保存成功");
        } catch (e) {
          console.warn("DirectLogin: ローカルストレージに保存失敗", e);
        }
      }
      
      // クッキーが正しく設定されたか確認
      if (isClient()) {
        setTimeout(() => {
          const savedCookie = getCookie(storageKey);
          console.log(`DirectLogin: クッキー検証 - ${storageKey} ${savedCookie ? '存在します' : '存在しません'}`);
          console.log("現在のクッキー: ", document.cookie);
        }, 100);
      }
      
      setSuccess(true);
      console.log("DirectLogin: セッションを保存しました");
      
      // 少し待ってからリダイレクト
      if (isClient()) {
        setTimeout(() => {
          window.location.href = '/depart?login_success=true&t=' + Date.now();
        }, 1500);
      }
    } catch (err: any) {
      console.error("DirectLogin: 例外が発生", err);
      setError(err.message || "ログイン中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#f0f4fd] to-[#d7e3fc]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>シンプルログイン</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            問題が解決しない場合はこちらの簡易ログインをお試しください
          </p>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="direct-email">メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="direct-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-password">パスワード</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="direct-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            {success && (
              <div className="p-3 bg-green-50 border border-green-300 rounded-md">
                <p className="text-sm text-green-700">ログイン成功！リダイレクトしています...</p>
              </div>
            )}
            
            <div className="p-3 rounded-md text-xs bg-gray-50 text-gray-500">
              デバッグ情報:<br />
              {isClient() && (
                <>
                  ホスト: {window.location.hostname}<br />
                  セッションストレージ: {(() => {
                    try { return Object.keys(sessionStorage).length; } 
                    catch (e) { return '利用不可'; }
                  })()}個<br />
                  ローカルストレージ: {(() => {
                    try { return Object.keys(localStorage).length; } 
                    catch (e) { return '利用不可'; }
                  })()}個<br />
                  クッキー: {document.cookie ? document.cookie.split(';').length : 0}個
                </>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit"
              className="w-full"
              disabled={loading || !email || !password}
            >
              {loading ? "処理中..." : "ログイン"}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default DirectLoginPage; 