'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/common/Spinner';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

// ローディング状態に応じた色を定義
const stateColors = {
  idle: 'bg-transparent',
  authenticating: 'bg-blue-50',
  'loading-profile': 'bg-blue-50',
  error: 'bg-red-50'
};

// アニメーション設定
const variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

export function LoadingUI() {
  const { loading, loadingState, loadingMessage, manualReload } = useAuth();
  const pathname = usePathname();
  const [isLoginPage, setIsLoginPage] = useState(false);
  const [visible, setVisible] = useState(false);
  
  // 現在のパスがログインページかをチェック
  useEffect(() => {
    setIsLoginPage(pathname === '/login');
  }, [pathname]);
  
  // ローディング状態に基づいて表示・非表示を制御
  useEffect(() => {
    if (loading || loadingState !== 'idle') {
      setVisible(true);
    } else {
      // ローディングが終了した場合、少し遅延させて非表示にすることでアニメーションを見せる
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [loading, loadingState]);
  
  // ログインページでのエラー表示を簡素化
  if (isLoginPage && loadingState === 'error') {
    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-0 left-0 w-full p-4 flex justify-center z-50"
        >
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md shadow-md max-w-md w-full">
            <div className="flex">
              <div className="py-1 mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="font-bold">エラーが発生しました</p>
                <p className="text-sm">{loadingMessage || 'ログイン処理中にエラーが発生しました。再試行してください。'}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }
  
  // ローディング中でなく、アイドル状態の場合は何も表示しない
  if (!visible) {
    return null;
  }
  
  return (
    <AnimatePresence>
      <motion.div
        key="loading-ui"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={variants}
        className={`fixed top-0 left-0 w-full h-full flex items-center justify-center z-50 ${stateColors[loadingState]} bg-opacity-90`}
      >
        <motion.div 
          className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
          layout
        >
          <div className="flex items-center justify-center">
            {loadingState !== 'error' ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 1, 
                  ease: "linear" 
                }}
              >
                <Spinner size="lg" color="primary" />
              </motion.div>
            ) : (
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-red-500 text-4xl mb-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-12 h-12">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </motion.div>
            )}
          </div>
          
          <motion.h2 
            layout
            className="text-xl font-semibold text-center mt-4 mb-2"
          >
            {loadingState === 'authenticating' && '認証処理中'}
            {loadingState === 'loading-profile' && 'プロファイル読み込み中'}
            {loadingState === 'error' && 'エラーが発生しました'}
            {loadingState === 'idle' && 'データ読み込み中'}
          </motion.h2>
          
          <motion.p 
            layout
            className="text-gray-600 text-center mb-4"
          >
            {loadingMessage || 'しばらくお待ちください...'}
          </motion.p>
          
          {loadingState === 'error' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <p className="text-sm text-gray-500 mb-4">
                {isLoginPage ? 
                  'もう一度ログインをお試しください。' : 
                  '時間をおいてもう一度お試しください。問題が解決しない場合は管理者にお問い合わせください。'}
              </p>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={manualReload}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
              >
                {isLoginPage ? 'ログインページを再読み込み' : '再読み込み'}
              </motion.button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 