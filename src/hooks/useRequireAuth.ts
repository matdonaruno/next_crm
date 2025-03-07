// src/hooks/useRequireAuth.ts
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    // ロード中は何もしない
    if (loading) return;

    // 認証されていない場合はログインページにリダイレクト
    if (!user) {
      router.push("/login");
      return;
    }

    // 現在のパスがユーザー設定ページの場合は、チェックをスキップ
    if (pathname === "/user-settings") {
      return;
    }

    // フルネームが設定されていない場合はユーザー設定ページにリダイレクト
    if (!profile?.fullname) {
      router.push("/user-settings");
      return;
    }

    // 施設IDが設定されていない場合はユーザー設定ページにリダイレクト
    if (!profile?.facility_id) {
      router.push("/user-settings");
      return;
    }
  }, [user, profile, loading, router, pathname]);
}
