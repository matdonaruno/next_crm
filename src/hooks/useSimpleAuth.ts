import { useState, useEffect } from 'react';
import supabase from '@/lib/supabaseBrowser';

/**
 * 非常にシンプルな認証フック（Webソケット接続なし）
 * 注: 認証状態の変更監視はAuthProviderに一本化するため、このフックでは購読しません
 */
export function useSimpleAuth() {
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 初期化時にセッションを1回だけチェック
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session || null);
      } catch (error) {
        console.error('セッション確認エラー:', error);
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // 認証状態変更のリスナーは使わない（AuthProviderに一本化）
    return () => {
      // クリーンアップ（何もしない）
    };
  }, []);

  return { user: session?.user || null, loading };
}