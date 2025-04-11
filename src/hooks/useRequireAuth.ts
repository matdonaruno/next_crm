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
      // 現在既にログインページにいる場合はリダイレクトをスキップ
      if (pathname !== "/login") {
        router.push("/login");
      }
      return;
    }

    // リダイレクト機能を一時的に無効化: プロファイルの状態に関わらず処理を続行
    console.log("useRequireAuth: プロファイルチェックを実行", {
      hasFullname: !!profile?.fullname,
      hasFacilityId: !!profile?.facility_id,
      willContinue: true
    });

    // 以下の条件はログとして残すが、リダイレクトは行わない
    if (!profile?.fullname) {
      console.log("useRequireAuth: フルネームが設定されていません（リダイレクト無効化中）");
    }

    if (!profile?.facility_id) {
      console.log("useRequireAuth: 施設IDが設定されていません（リダイレクト無効化中）");
    }
  }, [user, profile, loading, router, pathname]);
}
