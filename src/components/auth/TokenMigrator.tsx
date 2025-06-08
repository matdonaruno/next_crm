'use client';

import { useEffect } from "react";
import Cookies from 'js-cookie';
import supabaseClient from '@/lib/supabaseBrowser';

/**
 * トークン移行コンポーネント
 * - 古いトークン形式を削除
 * - ローカルストレージからクッキーへの移行
 * - セッション不整合検出と修復
 */
export function TokenMigrator() {
  // アプリ起動時に一度だけ実行
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    console.log("TokenMigrator: 初期化");
    
    // 古いトークンキーを削除する処理
    const oldKey = 'supabase.auth.token';
    if (localStorage.getItem(oldKey)) {
      console.log("TokenMigrator: 古いトークンキーをローカルストレージから削除");
      localStorage.removeItem(oldKey);
    }
    
    // 古いクッキーを削除
    if (Cookies.get(oldKey)) {
      console.log("TokenMigrator: 古いトークンキーをクッキーから削除");
      Cookies.remove(oldKey, { path: '/' });
    }
    
    // Supabase URLからプロジェクトIDを抽出
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
    
    // プロジェクトIDが取得できない場合は処理をスキップ
    if (!projectId) {
      console.log("TokenMigrator: プロジェクトIDが取得できないため処理スキップ");
      return;
    }
    
    const storageKey = `sb-${projectId}-auth-token`;
    
    // セッション整合性チェックとトークン移行
    const migrateTokens = async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        
        console.log("TokenMigrator: セッション確認", {
          hasSession: !!data.session,
          userId: data.session?.user?.id || "なし",
          error: error?.message || "なし",
          cookieExists: !!Cookies.get(storageKey),
          localStorageExists: !!localStorage.getItem(storageKey)
        });
        
        // セッション整合性チェック
        const hasCookieToken = !!Cookies.get(storageKey);
        const hasLocalStorageToken = !!localStorage.getItem(storageKey);
        
        // セッションがあるが、クッキーにトークンがない場合は不整合
        if (data.session && !hasCookieToken) {
          console.log("TokenMigrator: セッションとクッキーの不整合を検出");
          
          // TODO: v2 API移行時に修正 - supabase.auth.signOut() に変更
          await supabaseClient.auth.signOut({ scope: 'local' });
          
          // ログインページへリダイレクト
          window.location.href = '/login';
          return;
        }
        
        // ローカルストレージからクッキーへの移行
        if (hasLocalStorageToken && !hasCookieToken) {
          console.log("TokenMigrator: ローカルストレージからクッキーへの移行を実行");
          try {
            const sessionData = localStorage.getItem(storageKey);
            if (sessionData) {
              Cookies.set(storageKey, sessionData, {
                expires: 7,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax', // PKCEフローではlaxが必要
                path: '/'
              });
              // 移行後にローカルストレージから削除
              localStorage.removeItem(storageKey);
            }
          } catch (e) {
            console.error("TokenMigrator: セッション移行エラー", e);
          }
        }
      } catch (e) {
        console.error("TokenMigrator: セッション確認エラー", e);
      }
    };
    
    // 初期化時に一度だけ実行
    migrateTokens();
  }, []);
  
  // 表示なし
  return null;
} 