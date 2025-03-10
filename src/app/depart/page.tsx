'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; 
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/ui/app-header';
import { cacheDepartments, getCachedDepartments } from '@/lib/departmentCache';

interface Department {
    id: string;
    name: string;
    facility_id?: string;
  }

export default function Home() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuActive, setIsMenuActive] = useState(false);
  const [dataFetchAttempted, setDataFetchAttempted] = useState(false);
  const menuIconRef = useRef<HTMLDivElement>(null);
  
  // 認証とプロファイルチェック
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 認証状態のロードが完了していない場合は待機
        if (loading) return;

        // 認証されていない場合はログインページにリダイレクト
        if (!user) {
          router.push("/login");
          return;
        }

        // フルネームまたは施設IDが設定されていない場合はユーザー設定ページにリダイレクト
        if (!profile?.fullname || !profile?.facility_id) {
          router.push("/user-settings");
          return;
        }

        setIsLoading(false);
      } catch (error) {
        console.error("認証チェックエラー:", error);
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [user, profile, loading, router]);
  
  // 部署データの取得
  const fetchDepartments = useCallback(async () => {
    setDataFetchAttempted(true);
    
    if (loading) {
      console.log("認証情報のロード中です。部署データの取得を待機します。");
      return;
    }
    
    if (!profile?.facility_id) {
      console.log("施設IDが設定されていません。部署データを取得できません。");
      setIsLoading(false);
      return;
    }
    
    try {
      console.log("部署データ取得を開始します");
      
      // 施設IDの前後の空白を削除
      const cleanFacilityId = profile.facility_id.trim();
      console.log("クリーニングした施設ID:", cleanFacilityId);
      
      // 施設IDに基づいて部署を取得（直接クエリ）
      const { data, error } = await supabase
        .from("departments")
        .select('*')
        .eq('facility_id', cleanFacilityId);
        
      if (error) {
        console.error("部署データの取得エラー:", error);
        
        // エラー時にキャッシュデータを使用
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) {
          console.log("エラーが発生したため、キャッシュから部署データを使用します");
          setDepartments(cached);
          setActiveDept(cached[0].id);
        }
        
        setIsLoading(false);
        return;
      }
      
      console.log("取得した部署データ:", data);
      console.log("部署の総数:", data?.length || 0);
      
      if (data && data.length > 0) {
        // 取得したデータをキャッシュに保存
        cacheDepartments(data);
        setDepartments(data);
        setActiveDept(data[0].id);
      } else {
        console.log("施設IDに一致する部署が見つかりません");
        // バックアップとして、すべての部署を試す
        const { data: allDepts, error: allError } = await supabase
          .from("departments")
          .select('*');
          
        if (!allError && allDepts && allDepts.length > 0) {
          console.log("すべての部署データを表示します:", allDepts);
          cacheDepartments(allDepts);
          setDepartments(allDepts);
          setActiveDept(allDepts[0].id);
        }
      }
    } catch (fetchError) {
      console.error("部署データ取得中に例外が発生しました:", fetchError);
      
      // 例外発生時にキャッシュデータを使用
      const cached = getCachedDepartments();
      if (cached && cached.length > 0) {
        console.log("例外が発生したため、キャッシュから部署データを使用します");
        setDepartments(cached);
        setActiveDept(cached[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }, [loading, profile, setIsLoading]);

  // 部署データ取得の実行
  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);
  
  // タイムアウト処理を追加
  useEffect(() => {
    // 最大5秒後にはロード状態を解除し、キャッシュを確認
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.log("部署データ取得がタイムアウトしました。強制的にロード状態を解除します。");
        
        // タイムアウト時にキャッシュデータを使用
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) {
          console.log("タイムアウトのため、キャッシュから部署データを使用します");
          setDepartments(cached);
          setActiveDept(cached[0].id);
        }
        
        setIsLoading(false);
      }
    }, 5000); // 5秒でタイムアウト
    
    return () => clearTimeout(timeoutId);
  }, [isLoading]);
  
  // ハンバーガーメニューの開閉ロジック
  useEffect(() => {
    // ロード中は何もしない
    if (isLoading) return;

    const body = document.querySelector('body');
    if (!body) return;

    // ページロード時にメニューを閉じる
    body.classList.remove('nav-active');
    setIsMenuActive(false);

    // 元のbodyスタイルを保存
    const originalBackgroundColor = body.style.backgroundColor;
    const originalBackgroundImage = body.style.backgroundImage;
    const originalColor = body.style.color;
    
    // このページ用にbodyスタイルを変更
    body.style.backgroundColor = '#ffffff';
    body.style.backgroundImage = 'none';
    body.style.color = '#333333';

    return () => {
      // クリーンアップ時に元のスタイルに戻す
      body.style.backgroundColor = originalBackgroundColor;
      body.style.backgroundImage = originalBackgroundImage;
      body.style.color = originalColor;
    };
  }, [isLoading]);

  // メニュークリックハンドラー
  const handleMenuClick = () => {
    const body = document.querySelector('body');
    if (!body) return;
    
    // nav-activeクラスをトグル
    if (body.classList.contains('nav-active')) {
      body.classList.remove('nav-active');
      setIsMenuActive(false);
    } else {
      body.classList.add('nav-active');
      setIsMenuActive(true);
    }
  };

  // ロード中の表示
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div
      className="header w-full min-h-screen relative"
      style={{
        background: 'linear-gradient(60deg, #fcd1e8 0%, #dccbf8 100%)', // うすピンク→薄紫
      }}
    >
      {/* ヘッダー */}
      <AppHeader showBackButton={false} />
      
      {/* ===================== ハンバーガーメニュー + Nav ===================== */}
      <header className="cd-header mt-8 pt-4">
        <div className="header-wrapper">
          <div className="logo-wrap">
          <a href="#" className="hover-target">
              <span>life has</span>limit
            </a>
          </div>
          <div className="nav-but-wrap">
            <div 
              ref={menuIconRef}
              className="menu-icon hover-target"
              onClick={handleMenuClick}
            >
              <span className="menu-icon__line menu-icon__line-left"></span>
              <span className="menu-icon__line"></span>
              <span className="menu-icon__line menu-icon__line-right"></span>
            </div>
          </div>
        </div>
      </header>

      {/* サイドメニュー */}
      <div className={`nav ${isMenuActive ? 'nav-active' : ''}`} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 10,
        opacity: isMenuActive ? 1 : 0,
        visibility: isMenuActive ? 'visible' : 'hidden',
        transition: 'all 0.3s ease-in-out',
      }}>
        <div className="nav__content">
          <ul className="nav__list">
            {departments.map((dept) => (
              <li key={dept.id} className="nav__list-item" style={{
                padding: '0.5rem 0',
              }}>
                <Link
                  href={`/taskpick?department=${encodeURIComponent(dept.name)}&departmentId=${dept.id}`}
                  className={`
                    px-6 py-2 
                    rounded-lg 
                    transition-colors
                    block
                    text-white
                    hover:bg-white/10
                    ${activeDept === dept.id
                      ? 'bg-white/20'
                      : ''
                    }
                  `}
                >
                  {dept.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ===================== メインコンテンツ ===================== */}
      <div className="inner-header flex mt-8">
        <center>
            <div className="text-2xl font-bold" style={{ color: '#8167a9' }}>Labo Logbook</div>
        </center>
      </div>

      <div>
        <center>
            <div className="text-1xl font-bold" style={{ color: '#8167a9' }}>メニューから部署を選択してはじめましょう</div>
        </center>
      </div>

      {/* 下部のウェーブSVG */}
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

      <div className="content flex">
      <p>for your side partner | designed By.Goodkatz</p>
      </div>
    </div>
  );
}
