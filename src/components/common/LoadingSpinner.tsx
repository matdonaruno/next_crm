'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = '読み込み中...', 
  fullScreen = false 
}) => {
  const containerClass = fullScreen 
    ? "flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-100 to-purple-100"
    : "flex items-center justify-center p-8";

  return (
    <div className={containerClass}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center space-y-4"
      >
        <div className="h-10 w-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-pink-700 text-center">{message}</p>
      </motion.div>
    </div>
  );
};

// カード内で使用する場合のコンパクト版
export const CompactLoadingSpinner: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center space-y-3">
        <div className="h-8 w-8 border-3 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
        {message && <p className="text-sm text-pink-600">{message}</p>}
      </div>
    </div>
  );
};

// ボタン内で使用する小さなスピナー
export const ButtonSpinner: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => {
  return (
    <div className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin`}></div>
  );
};