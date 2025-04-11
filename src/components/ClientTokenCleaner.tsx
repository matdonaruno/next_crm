'use client';

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Cookies from 'js-cookie';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// グローバル変数の型宣言を追加
declare global {
  interface Window {
    isManualNavigation: boolean;
  }
}

// 手動ナビゲーションを追跡するためのグローバルフラグ
// このフラグはユーザー設定ボタンがクリックされたときにtrueに設定される
if (typeof window !== 'undefined') {
  window.isManualNavigation = window.isManualNavigation || false;
}

export function ClientTokenCleaner() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isLoginPage = pathname === '/login' || pathname === '/direct-login';
  const isRegisterPage = pathname === '/register' || pathname?.startsWith('/register?') || false;
  const isRootPage = pathname === '/';
  const isPublicPage = isLoginPage || isRootPage || isRegisterPage; // 公開ページ（認証不要）
  const redirectedRef = useRef(false);
  const lastPathRef = useRef(pathname);
  const [redirecting, setRedirecting] = useState(false);
  
  // セッション管理の改善
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("ClientTokenCleaner: 初期化", { 
        isLoginPage, 
        isRootPage, 
        isRegisterPage, 
        isPublicPage, 
        loading,
        path: pathname
      });
      
      // ローディング中やリダイレクト中は処理をスキップ
      if (loading || redirecting) {
        console.log("ClientTokenCleaner: ローディング中またはリダイレクト中のため処理をスキップします");
        return;
      }
      
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
      
      // ログインページでは不整合チェックをスキップ（意図的なセッションクリアのため）
      if (isLoginPage) {
        console.log("ClientTokenCleaner: ログインページのため、不整合チェックをスキップします");
        
        // ログイン済みならホームページにリダイレクト
        if (user && !redirectedRef.current) {
          console.log("ClientTokenCleaner: ログイン済みユーザーをリダイレクト");
          redirectedRef.current = true;
          setRedirecting(true);
          
          // アニメーションのためにわずかに遅延
          setTimeout(() => {
            router.push('/');
          }, 100);
        }
        
        return;
      }
      
      // 登録ページでは認証チェックをスキップする（招待ユーザー向け）
      if (isRegisterPage) {
        console.log("ClientTokenCleaner: 登録ページのため、認証チェックをスキップします");
        return;
      }
      
      // 未ログインなら保護ページからログインページへリダイレクト（公開ページは除外）
      if (!user && !isPublicPage && !redirectedRef.current) {
        console.log("ClientTokenCleaner: 未ログインユーザーをログインページへリダイレクト");
        redirectedRef.current = true;
        setRedirecting(true);
        
        // アニメーションのためにわずかに遅延
        setTimeout(() => {
          router.push('/login');
        }, 100);
        return;
      }
      
      // Supabase URLからプロジェクトIDを抽出
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'bsgvaomswzkywbiubtjg';
      const storageKey = `sb-${projectId}-auth-token`;
      
      // 現在のセッションを確認
      const checkSession = async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          
          console.log("ClientTokenCleaner: セッション確認", {
            hasSession: !!data.session,
            userId: data.session?.user?.id || "なし",
            error: error?.message || "なし",
            cookieExists: !!Cookies.get(storageKey),
            localStorageExists: !!localStorage.getItem(storageKey)
          });
          
          // セッションがあるが、クッキーにトークンがない場合のみチェック
          // より少ない条件でチェックすることで安定性を向上
          const hasCookieToken = !!Cookies.get(storageKey);
          const hasLocalStorageToken = !!localStorage.getItem(storageKey);
          
          if (data.session && !hasCookieToken) {
            console.log("ClientTokenCleaner: セッションとクッキーの不整合を検出");
            
            // セッションをクリアして再ログインを促す
            await supabase.auth.signOut({ scope: 'local' });
            
            // リダイレクト状態をセット
            setRedirecting(true);
            
            // ログインページにリダイレクト（アニメーション遷移用に少し遅延）
            setTimeout(() => {
              window.location.href = '/login';
            }, 100);
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
  }, [isLoginPage, isRootPage, isRegisterPage, isPublicPage, loading, user, router, redirecting, pathname]);
  
  // パスが変わったらリダイレクトフラグをリセット
  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      console.log("ClientTokenCleaner: パスが変更されたためリダイレクトフラグをリセット", {
        oldPath: lastPathRef.current,
        newPath: pathname,
        isManualNavigation: window.isManualNavigation
      });
      
      // ロギングを強化して、user-settingsへのリダイレクトかどうかを確認
      if (pathname === '/user-settings') {
        console.log("ClientTokenCleaner: user-settingsページへのリダイレクトが検出されました。これは意図したリダイレクトですか？", {
          isManualNavigation: window.isManualNavigation
        });
        
        // 予期しない自動リダイレクトを検出した場合（手動ナビゲーションでない場合のみブロック）
        if (lastPathRef.current === '/depart' && !window.isManualNavigation) {
          console.log("ClientTokenCleaner: /departからの自動リダイレクトを検出。リダイレクトをブロックします。");
          // 少し遅延してから元のページに戻す
          setTimeout(() => {
            router.back();
          }, 50);
          return;
        } else {
          console.log("ClientTokenCleaner: 手動ナビゲーションによるリダイレクトを許可します。");
        }
      }
      
      // ナビゲーションフラグをリセット
      window.isManualNavigation = false;
      
      redirectedRef.current = false;
      setRedirecting(false);
      lastPathRef.current = pathname;
    }
  }, [pathname, router]);
  
  // このコンポーネントは何も表示しない
  return null;
} 