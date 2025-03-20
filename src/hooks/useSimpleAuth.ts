import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// シンプルな認証フック（定期的なセッション確認なし）
export function useSimpleAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 初期化時にセッションを1回だけチェック
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUser(data.session?.user || null);
      } catch (error) {
        console.error('セッション確認エラー:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // 認証状態変更のリスナー
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
} 