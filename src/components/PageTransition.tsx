'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// 異なるページタイプのアニメーション設定
const transitions = {
  // ログインページのアニメーション
  login: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { 
      type: "tween", 
      ease: "easeInOut", 
      duration: 0.3 
    }
  },
  // ダッシュボードページのアニメーション
  dashboard: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 30,
      duration: 0.4
    }
  },
  // その他の一般ページのアニメーション
  default: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { 
      type: "spring", 
      stiffness: 250, 
      damping: 25,
      duration: 0.3
    }
  }
};

// ページ遷移を遅延させるための状態管理
function useDelayedPathname(delayMs = 100) {
  const pathname = usePathname();
  const [delayedPathname, setDelayedPathname] = useState(pathname);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayedPathname(pathname);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [pathname, delayMs]);

  return { currentPath: pathname, delayedPath: delayedPathname };
}

// ページタイプの判定
function getPageType(pathname: string | null): 'login' | 'dashboard' | 'default' {
  if (!pathname) return 'default';
  
  if (pathname === '/login' || pathname === '/direct-login') {
    return 'login';
  }
  if (pathname === '/' || pathname === '/reagent_dash') {
    return 'dashboard';
  }
  return 'default';
}

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const { loading } = useAuth();
  const { currentPath, delayedPath } = useDelayedPathname();
  const pageType = getPageType(currentPath);
  
  // アニメーション設定を取得
  const animation = transitions[pageType];
  
  // ローディング中は遷移アニメーションを短縮
  const transitionConfig = loading 
    ? { ...animation.transition, duration: 0.1 } 
    : animation.transition;
  
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={delayedPath}
        initial={animation.initial}
        animate={animation.animate}
        exit={animation.exit}
        transition={transitionConfig}
        className="min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
} 