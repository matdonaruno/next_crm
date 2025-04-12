// src/hooks/useRequireAuth.ts
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

// デバッグモードフラグ（開発環境ではクエリパラメータで制御可能）
const isDebugMode = process.env.NODE_ENV === 'development' && 
  typeof window !== 'undefined' && 
  new URLSearchParams(window.location.search).has('debug');

// ログ関数（開発環境のデバッグモードのみで動作）
const debugLog = (message: string, data?: any) => {
  if (isDebugMode) {
    console.log(message, data);
  }
};

export function useRequireAuth(options = { redirectTo: "/login", enforceProfile: true }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading, sessionCheckEnabled, loadingState } = useAuth();
  const { toast } = useToast();
  const [authCheck, setAuthCheck] = useState<'pending' | 'success' | 'failed'>('pending');

  useEffect(() => {
    // セッションチェックが無効化されている場合は警告（デバッグモードのみ）
    if (!sessionCheckEnabled && isDebugMode) {
      console.warn("useRequireAuth: セッションチェックが無効化されています。本番環境では有効にしてください。");
    }

    // ロード中は何もしない
    if (loading) {
      return;
    }

    // 認証状態のログ（デバッグモードのみ）
    debugLog("useRequireAuth: 認証状態チェック", {
      user: !!user,
      profile: !!profile,
      loading,
      pathname,
      loadingState,
      authCheck
    });

    // 認証されていない場合はログインページにリダイレクト
    if (!user) {
      // 現在既にログインページやパブリックページにいる場合はリダイレクトをスキップ
      const publicPaths = ['/login', '/register', '/password-reset', '/verify'];
      if (!publicPaths.some(path => pathname?.startsWith(path))) {
        // ログイン以外のページでは認証エラーを表示
        toast({
          title: "認証が必要です",
          description: "続行するにはログインしてください",
          variant: "destructive",
        });
        
        // リダイレクト時に現在のURLをクエリパラメータとして渡す（ログイン後に戻れるように）
        const returnUrl = encodeURIComponent(pathname || '/');
        router.push(`${options.redirectTo}?returnUrl=${returnUrl}`);
        setAuthCheck('failed');
      }
      return;
    }

    // プロファイル情報のチェック（オプションで無効化可能）
    if (options.enforceProfile && profile) {
      const profileComplete = !!profile.fullname && !!profile.facility_id;
      
      // プロファイルチェックのログ（デバッグモードのみ）
      debugLog("useRequireAuth: プロファイルチェック", {
        hasFullname: !!profile.fullname,
        hasFacilityId: !!profile.facility_id,
        profileComplete
      });

      // プロファイル情報が不完全な場合の処理
      if (!profileComplete && pathname !== '/user-settings') {
        toast({
          title: "プロフィール情報の入力が必要です",
          description: "ユーザー設定ページに移動します",
          variant: "default",
        });
        router.push('/user-settings');
        return;
      }
    }

    // すべてのチェックをパスした場合
    setAuthCheck('success');
  }, [user, profile, loading, router, pathname, sessionCheckEnabled, loadingState, toast, options, authCheck]);

  // 認証状態を返す
  return { 
    user, 
    profile, 
    loading, 
    isAuthenticated: !!user,
    isProfileComplete: !!profile?.fullname && !!profile?.facility_id,
    authCheck 
  };
}
