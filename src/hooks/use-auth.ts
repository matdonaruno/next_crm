import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import supabaseClient from '@/lib/supabaseClient';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log("認証状態を確認中...");
    
    try {
      // 現在のセッションを取得
      const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
        (event: AuthChangeEvent, session: Session | null) => {
          console.log("認証状態変更:", event, session?.user?.id ?? "ユーザーなし");
          setUser(session?.user ?? null);
          setLoading(false);
        }
      );

      // 初期状態のロード
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        console.log("セッション取得成功:", session?.user?.id ?? "ユーザーなし");
        setUser(session?.user ?? null);
        setLoading(false);
      }).catch((err: unknown) => {
        console.error('認証エラー:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

      return () => {
        console.log("認証監視を終了します");
        subscription.unsubscribe();
      };
    } catch (err) {
      console.error('認証初期化エラー:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      return () => {}; // 空のクリーンアップ関数
    }
  }, []);

  return { user, loading, error };
} 