'use client';

import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CuteLoadingIndicator from './common/CuteLoadingIndicator'; // 新しいインポート

// 認証状態の型
type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface Props {
  /** true = ログイン済みなら表示なし。false = 常に表示なし（認証不要） */
  requireAuth?: boolean;
}

// 読み込み UI コンポーネント - シンプル化、SSR対応強化
export default function LoadingUI({ requireAuth = true }: Props) {
  const session = useSession();
  const supabase = useSupabaseClient();
  const { toast } = useToast();
  
  const [authState, setAuthState] = useState<AuthState>('loading');

  // セッション状態の監視と管理 (SSR互換)
  useEffect(() => {
    // 認証不要の場合は何も表示しない
    if (!requireAuth) {
      setAuthState('authenticated');
      return;
    }
    
    // セッションチェック
    if (session === undefined) {
      // まだロード中
      setAuthState('loading');
    } else if (session) {
      // 認証済み
      setAuthState('authenticated');
      console.log('LoadingUI: 認証済み状態に更新');
    } else {
      // 未認証
      setAuthState('unauthenticated');
    }
  }, [session, requireAuth]);

  // 再試行ハンドラー
  const handleRetry = async () => {
    setAuthState('loading');
    
    try {
      // セッション再確認
      const { error } = await supabase.auth.getUser();
      
      if (error) {
        toast({
          title: '認証エラー',
          description: error.message || '認証の再試行中にエラーが発生しました',
          variant: 'destructive',
        });
        setAuthState('unauthenticated');
      }
    } catch (err: any) {
      toast({
        title: '認証エラー',
        description: err.message || '認証の再試行中にエラーが発生しました',
        variant: 'destructive',
      });
      setAuthState('unauthenticated');
    }
  };

  // 認証済みまたは認証不要の場合は何も表示しない
  if (authState === 'authenticated') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center min-h-screen bg-gradient-to-r from-purple-50 to-pink-50">
      <AnimatePresence mode="wait">
        <motion.div
          key={authState}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="p-8 bg-white shadow-xl rounded-2xl max-w-md w-full mx-4"
        >
          {authState === 'loading' && (
            // 既存のローディング表示を置き換え
            <CuteLoadingIndicator message="セッション情報を確認中..." />
            /*
            <div className="flex flex-col items-center text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 border-4 border-purple-200 border-t-purple-500 rounded-full mb-4"
              />
              <p className="text-gray-600">セッション情報を確認中...</p>
            </div>
            */
          )}

          {authState === 'unauthenticated' && (
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4"
              >
                <AlertCircle className="w-8 h-8 text-red-500" />
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">ログインが必要です</h3>
              <p className="text-gray-600 mb-6">このページを表示するにはログインが必要です</p>
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRetry}
                className="py-2 px-6 bg-purple-600 text-white rounded-lg shadow-md flex items-center"
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                再試行する
              </motion.button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}