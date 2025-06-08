'use client';

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@supabase/auth-helpers-react';
// navigation.tsの内容をインラインに
// import { createRouteChangeListener } from '@/utils/navigation';

// セッション監視コンポーネント
// - ページの公開/保護状態に基づき認証リダイレクトを行う
// - ログイン済みユーザーのログインページ表示を防止
export function SessionMonitor() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const session = useSession();
  const user = session?.user;
  const loading = session === undefined;
  
  // ページ分類
  const isLoginPage = ['/login', '/direct-login'].includes(pathname);
  const isRegisterPage = pathname === '/register' || pathname.startsWith('/register?');
  const isRootPage = pathname === '/';
  const isMeetingMinutesPage = pathname === '/meeting-minutes' || 
    pathname.startsWith('/meeting-minutes/');
  
  // 公開ページ一覧（リダイレクト対象外）
  const isPublicPage = isLoginPage || isRootPage || isRegisterPage || isMeetingMinutesPage;
  
  // リダイレクト制御
  const redirectedRef = useRef(false);
  const lastPathRef = useRef(pathname);
  const [redirecting, setRedirecting] = useState(false);

  // App Router互換のルート変更検知
  useEffect(() => {
    // ルート変更検出用の関数（インライン実装）
    const createLocalRouteChangeListener = (callback: () => void): () => void => {
      if (typeof window === 'undefined') return () => {};
    
      // MutationObserverでURLの変更を検出
      const observer = new MutationObserver(() => {
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== lastPath) {
          lastPath = currentPath;
          callback();
        }
      });
    
      // 初期パス
      let lastPath = window.location.pathname + window.location.search;
    
      // bodyの変更を監視（URL変更はDOM更新を伴うため）
      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
    
      // クリーンアップ関数
      return () => {
        observer.disconnect();
      };
    };

    // ルート変更検出
    const cleanup = createLocalRouteChangeListener(() => {
      console.log("SessionMonitor: ルート変更完了");
      redirectedRef.current = false;
      setRedirecting(false);
    });
    
    return cleanup;
  }, []);
  
  // セッション状態に基づくリダイレクト制御
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    console.log("SessionMonitor: セッション状態チェック", { 
      isLoginPage, 
      isPublicPage, 
      loggedIn: !!user,
      loading,
      path: pathname
    });
    
    // ローディング中/リダイレクト中は処理スキップ
    if (loading || redirecting) {
      console.log("SessionMonitor: ロード中/リダイレクト中のため処理スキップ");
      return;
    }
    
    // ログインページ特別処理: ログイン済みならホームにリダイレクト
    if (isLoginPage && user && !redirectedRef.current) {
      console.log("SessionMonitor: ログイン済みユーザーをホームにリダイレクト");
      redirectedRef.current = true;
      setRedirecting(true);
      
      // 遅延してルート変更を実行
      setTimeout(() => {
        router.push('/');
      }, 50);
      
      return;
    }
    
    // 登録ページは常にスキップ（インビテーションなど）
    if (isRegisterPage) {
      console.log("SessionMonitor: 登録ページのため処理スキップ");
      return;
    }
    
    // 保護ページ処理: 未ログインなら強制的にログインページへ
    if (!loading && user === null && !isPublicPage && !redirectedRef.current) {
      console.log("SessionMonitor: 未ログインユーザーをログインページへリダイレクト");
      redirectedRef.current = true;
      setRedirecting(true);
      
      // 遅延してルート変更を実行
      setTimeout(() => {
        router.push('/login');
      }, 50);
    }
    
  }, [isLoginPage, isPublicPage, isRegisterPage, loading, user, router, redirecting, pathname]);
  
  // パス変更時のリダイレクトフラグリセット
  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      console.log("SessionMonitor: パス変更検知", {
        from: lastPathRef.current,
        to: pathname
      });
      
      redirectedRef.current = false;
      setRedirecting(false);
      lastPathRef.current = pathname;
    }
  }, [pathname]);
  
  // 表示なし
  return null;
} 