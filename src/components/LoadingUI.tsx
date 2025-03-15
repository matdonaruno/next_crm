'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/common/Spinner';

// ローディング状態に応じた色を定義
const stateColors = {
  idle: 'bg-transparent',
  authenticating: 'bg-blue-50',
  'loading-profile': 'bg-blue-50',
  error: 'bg-red-50'
};

export function LoadingUI() {
  const { loading, loadingState, loadingMessage, manualReload } = useAuth();
  
  // ローディング中でなければ何も表示しない
  if (!loading && loadingState === 'idle') {
    return null;
  }
  
  return (
    <div className={`fixed top-0 left-0 w-full h-full flex items-center justify-center z-50 ${stateColors[loadingState]} bg-opacity-90`}>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <div className="flex items-center justify-center">
          {loadingState !== 'error' ? (
            <Spinner size="lg" color="primary" />
          ) : (
            <div className="text-red-500 text-4xl mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-12 h-12">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}
        </div>
        
        <h2 className="text-xl font-semibold text-center mt-4 mb-2">
          {loadingState === 'authenticating' && '認証処理中'}
          {loadingState === 'loading-profile' && 'プロファイル読み込み中'}
          {loadingState === 'error' && 'エラーが発生しました'}
          {loadingState === 'idle' && 'データ読み込み中'}
        </h2>
        
        <p className="text-gray-600 text-center mb-4">
          {loadingMessage || 'しばらくお待ちください...'}
        </p>
        
        {loadingState === 'error' && (
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">
              時間をおいてもう一度お試しください。
              問題が解決しない場合は管理者にお問い合わせください。
            </p>
            
            <button
              onClick={manualReload}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
            >
              再読み込み
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 