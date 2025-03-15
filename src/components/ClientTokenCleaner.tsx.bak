'use client';

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Cookies from 'js-cookie';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function ClientTokenCleaner() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isTransitioning } = useAuth();
  const isLoginPage = pathname === '/login' || pathname === '/direct-login';
  const redirectedRef = useRef(false);
  const lastPathRef = useRef(pathname);
  
  // セッション管理の改善
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("ClientTokenCleaner: 初期化", { isLoginPage, isTransitioning });
      
      // 遷移中は処理をスキップ（ちらつき防止）
      if (isTransitioning) {
        console.log("ClientTokenCleaner: 遷移中のため処理をスキップします");
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
          router.push('/');
        }
        
        return;
      }
      
      // 未ログインなら保護ページからログインページへリダイレクト
      if (!user && !isLoginPage && !redirectedRef.current) {
        console.log("ClientTokenCleaner: 未ログインユーザーをログインページへリダイレクト");
        redirectedRef.current = true;
        router.push('/login');
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
            
            // ログインページにリダイレクト
            window.location.href = '/login';
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
  }, [isLoginPage, isTransitioning, user, router]);
  
  // パスが変わったらリダイレクトフラグをリセット
  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      console.log("ClientTokenCleaner: パスが変更されたためリダイレクトフラグをリセット", {
        oldPath: lastPathRef.current,
        newPath: pathname
      });
      redirectedRef.current = false;
      lastPathRef.current = pathname;
    }
  }, [pathname]);
  
  // このコンポーネントは何も表示しない
  return null;
} 