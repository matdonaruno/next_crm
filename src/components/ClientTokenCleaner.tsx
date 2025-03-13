'use client';

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export function ClientTokenCleaner() {
  // セッション管理の改善
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("ClientTokenCleaner: 初期化");
      
      // 古いトークンキーを削除する処理
      const oldKey = 'supabase.auth.token';
      if (localStorage.getItem(oldKey)) {
        console.log("ClientTokenCleaner: 古いトークンキーを削除します");
        localStorage.removeItem(oldKey);
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
            error: error?.message || "なし"
          });
          
          // セッションがあるが、ローカルストレージにトークンがない場合
          // または、ローカルストレージにトークンがあるが、セッションがない場合
          const hasLocalToken = !!localStorage.getItem(storageKey);
          
          if ((data.session && !hasLocalToken) || (!data.session && hasLocalToken)) {
            console.log("ClientTokenCleaner: セッションとローカルストレージの不整合を検出");
            
            // セッションをクリアして再ログインを促す
            await supabase.auth.signOut({ scope: 'local' });
            
            // ページをリロード
            window.location.href = '/login';
          }
        } catch (e) {
          console.error("ClientTokenCleaner: セッション確認エラー", e);
        }
      };
      
      // 初期化時にセッションを確認
      checkSession();
    }
  }, []);
  
  // このコンポーネントは何も表示しない
  return null;
} 