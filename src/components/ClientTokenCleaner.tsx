'use client';

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Cookies from 'js-cookie';
import { usePathname } from 'next/navigation';

export function ClientTokenCleaner() {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login' || pathname === '/direct-login';
  
  // セッション管理の改善
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("ClientTokenCleaner: 初期化", { isLoginPage });
      
      // 古いトークンキーを削除する処理
      const oldKey = 'supabase.auth.token';
      if (localStorage.getItem(oldKey)) {
        console.log("ClientTokenCleaner: 古いトークンキーをローカルストレージから削除します");
        localStorage.removeItem(oldKey);
      }
      
      // 古いクッキーを削除
      if (Cookies.get(oldKey)) {
        console.log("ClientTokenCleaner: 古いトークンキーをクッキーから削除します");
        Cookies.remove(oldKey, { path: '/' });
      }
      
      // Supabase URLからプロジェクトIDを抽出
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'bsgvaomswzkywbiubtjg';
      const storageKey = `sb-${projectId}-auth-token`;
      const codeVerifierKey = `sb-${projectId}-auth-code-verifier`;
      
      // ログインページでは不整合チェックをスキップ（意図的なセッションクリアのため）
      if (isLoginPage) {
        console.log("ClientTokenCleaner: ログインページのため、不整合チェックをスキップします");
        return;
      }
      
      // 現在のセッションを確認
      const checkSession = async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          
          console.log("ClientTokenCleaner: セッション確認", {
            hasSession: !!data.session,
            userId: data.session?.user?.id || "なし",
            error: error?.message || "なし",
            cookieExists: !!Cookies.get(storageKey),
            codeVerifierExists: !!Cookies.get(codeVerifierKey),
            localStorageExists: !!localStorage.getItem(storageKey)
          });
          
          // セッションがあるが、クッキーにトークンがない場合
          // または、クッキーにトークンがあるが、セッションがない場合
          const hasCookieToken = !!Cookies.get(storageKey);
          const hasCodeVerifier = !!Cookies.get(codeVerifierKey);
          const hasLocalStorageToken = !!localStorage.getItem(storageKey);
          
          if ((data.session && !hasCookieToken) || (!data.session && hasCookieToken) || (data.session && !hasCodeVerifier)) {
            console.log("ClientTokenCleaner: セッションとクッキーの不整合を検出");
            
            // セッションをクリアして再ログインを促す
            await supabase.auth.signOut({ scope: 'local' });
            
            // クッキーを明示的に削除
            Cookies.remove(storageKey, { path: '/' });
            Cookies.remove(codeVerifierKey, { path: '/' });
            
            // ローカルストレージも削除
            if (hasLocalStorageToken) {
              localStorage.removeItem(storageKey);
            }
            
            // ページをリロード
            window.location.href = '/login?refresh=true&ts=' + Date.now();
          }
          
          // ローカルストレージからクッキーへの移行
          if (hasLocalStorageToken && !hasCookieToken) {
            console.log("ClientTokenCleaner: ローカルストレージからクッキーへの移行を実行");
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
              console.error("ClientTokenCleaner: セッション移行エラー", e);
            }
          }
        } catch (e) {
          console.error("ClientTokenCleaner: セッション確認エラー", e);
        }
      };
      
      // 初期化時にセッションを確認
      checkSession();
    }
  }, [isLoginPage]);
  
  // このコンポーネントは何も表示しない
  return null;
} 