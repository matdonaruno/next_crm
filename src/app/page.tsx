'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function Home() {
  const { session, loading } = useAuth();
  const router  = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  /* ログイン済みならダッシュボードへリダイレクト */
  useEffect(() => {
    if (session) router.replace('/depart');
  }, [session, router]);

  /* セッション判定待ち */
  if (loading) {
    return <LoadingSpinner message="読み込み中..." fullScreen />;
  }

  /* 未ログイン (null) */
  return (
    <div className="header w-full min-h-screen relative">
      <div className="inner-header flex flex-col items-center">
        <h1 className="text-2xl font-bold mt-8">Labo Logbook</h1>

        <div className="mt-20">
          {isAuthenticating ? (
            <div className="px-6 py-3 text-lg font-medium border-2 border-white text-white rounded-lg bg-white/20 inline-flex items-center">
              <span className="mr-2">Loading...</span>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <button
              onClick={() => {
                setIsAuthenticating(true);
                router.push('/login');
              }}
              className="px-6 py-3 text-lg font-medium border-2 border-white text-white rounded-lg hover:bg-white/20 transition-all"
            >
              Login
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center">あなたの大切な時間を節約しましょう</p>

      {/* 波（装飾） */}
      <svg
        className="waves"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 24 150 28"
        preserveAspectRatio="none"
      >
        <defs>
          <path
            id="gentle-wave"
            d="M-160 44c30 0 58-18 88-18s58 18 88 18
               58-18 88-18 58 18 88 18 v44h-352z"
          />
        </defs>
        <g className="parallax">
          <use href="#gentle-wave" x="48" y="0" fill="rgba(255,255,255,0.7)" />
          <use href="#gentle-wave" x="48" y="3" fill="rgba(255,255,255,0.5)" />
          <use href="#gentle-wave" x="48" y="5" fill="rgba(255,255,255,0.3)" />
          <use href="#gentle-wave" x="48" y="7" fill="#fff" />
        </g>
      </svg>

      <footer className="content flex justify-center py-4">
        <p>© 2025 Labo Logbook</p>
      </footer>
    </div>
  );
}
