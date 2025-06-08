'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CuteLoadingIndicatorProps {
  message?: string;
}

const CuteLoadingIndicator: React.FC<CuteLoadingIndicatorProps> = ({ message = '読み込み中...' }) => {
  const dotVariants = {
    initial: {
      y: '0%',
    },
    animate: {
      y: ['0%', '-50%', '0%'],
      transition: {
        duration: 0.6,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-gradient-to-br from-pink-100 to-blue-100 rounded-lg shadow-md">
      <div className="flex space-x-2">
        <motion.span
          className="block w-3 h-3 bg-pink-400 rounded-full"
          variants={dotVariants}
          initial="initial"
          animate="animate"
          style={{ animationDelay: '0s' }}
        />
        <motion.span
          className="block w-3 h-3 bg-blue-400 rounded-full"
          variants={dotVariants}
          initial="initial"
          animate="animate"
          style={{ animationDelay: '0.1s' }}
        />
        <motion.span
          className="block w-3 h-3 bg-yellow-400 rounded-full"
          variants={dotVariants}
          initial="initial"
          animate="animate"
          style={{ animationDelay: '0.2s' }}
        />
      </div>
      <p className="text-sm font-medium text-gray-600">{message}</p>
    </div>
  );
};

export default CuteLoadingIndicator;