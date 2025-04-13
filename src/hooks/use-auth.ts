import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 現在のセッションを取得
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // 初期状態のロード
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((err: unknown) => {
      console.error('認証エラー:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, error };
} 