// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      console.log("Home: 認証状態チェック", { 
        userId: user?.id || 'なし', 
        loading, 
        isRedirecting,
        timestamp: new Date().toISOString()
      });
      
      // すでにリダイレクト中なら処理しない
      if (isRedirecting) {
        console.log("Home: すでにリダイレクト中のため処理をスキップ");
        return;
      }
      
      // ロード中は何もしない（UXを改善するためにローディング表示は表示する）
      if (loading) {
        console.log("Home: 認証情報ロード中のため処理を延期");
        return;
      }
      
      // ユーザーが認証済みの場合、departページに直接リダイレクト
      if (user) {
        console.log("Home: 認証済みユーザーを検出、departページへリダイレクト", user.id);
        setIsRedirecting(true);
        
        // 明示的にリダイレクト処理を実行
        try {
          console.log("Home: リダイレクト処理を実行開始 (/depart)");
          router.push('/depart');
          console.log("Home: リダイレクト処理を実行完了 (/depart)");
        } catch (e) {
          console.error("Home: リダイレクト中にエラー発生:", e);
          setIsRedirecting(false); // エラー時はリダイレクトフラグをリセット
        }
        return;
      }
      
      // 認証されていない場合はここでセッションを確認する必要はない
      // ユーザーはログインページに留まる
      console.log("Home: 認証されていないユーザー、ログインページを表示");
    };
    
    // 初回マウント時に一度だけ実行
    checkAuthAndRedirect();

    // 5秒後に認証状態確認を再試行（万が一の対策）
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.log("Home: 認証状態が5秒以上ロード中の状態です。リセットします。");
        // 万が一の場合の対応策
        window.location.reload();
      }
    }, 5000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [user, loading, router, isRedirecting]);

  // ロード中は適切なローディング表示を行う
  if (loading || isRedirecting) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">Labo Logbook</div>
          <div className="text-gray-600">読み込み中...</div>
          {loading && (
            <div className="mt-2 text-xs text-gray-500">
              認証情報を確認しています...
            </div>
          )}
          {isRedirecting && (
            <div className="mt-2 text-xs text-gray-500">
              リダイレクト中...
            </div>
          )}
        </div>
      </div>
    );
  }

  // 未認証の場合のみホームページを表示
  return (
    <div className="header w-full min-h-screen relative">
      {/* ヘッダー内ロゴ部分 */}
      <div className="inner-header flex">
        <center>
          <div className="text-2xl font-bold">Labo Logbook</div>
          <div className="mt-20">
            <Link 
              href="/login" 
              className="px-6 py-3 text-lg font-medium border-2 border-white text-white rounded-lg hover:bg-white/20 transition-all font-sans" 
              role="button"
            >
              &nbsp;Login&nbsp;
            </Link>
          </div>
        </center>
      </div>
      
      {/* キャッチコピー */}
      <div>
        <center>あなたの大切な時間を節約しましょう</center>
      </div>
      {/* ウェーブのSVG */}
      <div>
        <svg
          className="waves"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox="0 24 150 28"
          preserveAspectRatio="none"
          shapeRendering="auto"
        >
          <defs>
            <path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
          </defs>
          <g className="parallax">
            <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(255,255,255,0.7)" />
            <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(255,255,255,0.5)" />
            <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(255,255,255,0.3)" />
            <use xlinkHref="#gentle-wave" x="48" y="7" fill="#fff" />
          </g>
        </svg>
      </div>
      {/* フッターコンテンツ */}
      <div className="content flex">
        <p>© 2024 Labo Logbook</p>
      </div>
    </div>
  );
}
