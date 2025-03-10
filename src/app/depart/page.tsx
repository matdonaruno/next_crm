'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; 
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/ui/app-header';

// グローバルウィンドウに型を追加
interface ExtendedWindow extends Window {
  refreshUserData?: () => Promise<void>;
}

interface Department {
    id: string;
    name: string;
    facility_id?: string;
  }

export default function Home() {
  const router = useRouter();
  const { user, profile, loading, refreshUserData } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuActive, setIsMenuActive] = useState(false);
  const menuIconRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [dataFetchAttempted, setDataFetchAttempted] = useState(false);
  
  // キャッシュから部署データを取得する関数
  const getCachedDepartments = () => {
    if (typeof window === 'undefined') return null;
    try {
      const cachedDeptStr = localStorage.getItem('cached_departments');
      const cachedFacilityId = localStorage.getItem('cached_facility_id');
      
      // 施設IDが一致する場合のみキャッシュを使用
      if (cachedDeptStr && cachedFacilityId === profile?.facility_id) {
        console.log("キャッシュから部署データを取得します");
        return JSON.parse(cachedDeptStr) as Department[];
      }
      return null;
    } catch (error) {
      console.error("キャッシュからの部署取得エラー:", error);
      return null;
    }
  };

  // 部署データをキャッシュに保存する関数
  const cacheDepartments = (deptsToCache: Department[]) => {
    if (typeof window === 'undefined' || !profile?.facility_id) return;
    try {
      localStorage.setItem('cached_departments', JSON.stringify(deptsToCache));
      localStorage.setItem('cached_facility_id', profile.facility_id);
      console.log("部署データをキャッシュに保存しました");
    } catch (error) {
      console.error("部署キャッシュ保存エラー:", error);
    }
  };
  
  // 初回マウント時にキャッシュから部署データを取得
  useEffect(() => {
    if (!loading && profile?.facility_id) {
      const cached = getCachedDepartments();
      if (cached && cached.length > 0) {
        console.log("キャッシュから部署データを表示します:", cached.length, "件");
        setDepartments(cached);
        setActiveDept(cached[0].id);
        setIsLoading(false);
      }
    }
  }, [loading, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  
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
  }, [loading, profile, setIsLoading, setDepartments, setActiveDept, setDataFetchAttempted]); // eslint-disable-line react-hooks/exhaustive-deps
  
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
    }, 5000); // 10秒から5秒に短縮
    
    return () => clearTimeout(timeoutId);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // プロファイル情報のログ出力
  useEffect(() => {
    if (!loading) {
      console.log("認証情報:", { user: user?.id, profile: profile?.fullname, facilityId: profile?.facility_id });
    }
  }, [loading, user, profile]);

  // デバッグ用にrefreshUserData関数をグローバルに公開
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as ExtendedWindow).refreshUserData = refreshUserData;
      console.log("デバッグ用: window.refreshUserData() でユーザー情報を更新できます");
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as ExtendedWindow).refreshUserData;
      }
    };
  }, [refreshUserData]);

  // 認証チェック
  useEffect(() => {
    const checkAuth = async () => {
      if (loading) return; // まだロード中

      if (!user) {
        console.log("未認証のため、ログインページにリダイレクトします");
        router.push("/login");
        return;
      }

      if (!profile?.facility_id) {
        console.warn("ユーザーは認証されていますが、施設IDがありません");
      } else {
        // 認証済みかつ施設IDがある場合
        console.log("認証済み。ユーザー:", profile.fullname, "施設ID:", profile.facility_id);
        if (!dataFetchAttempted) {
          fetchDepartments();
        }
      }
    };

    try {
      checkAuth();
    } catch (error) {
      console.error("認証チェックエラー:", error);
    }
  }, [user, profile, loading, dataFetchAttempted, fetchDepartments, router]);

  // ハンバーガーメニューの開閉ロジック
  const handleMenuClick = () => {
    setIsMenuActive(!isMenuActive);
    
    // メニューアイコンのクラスを切り替え
    if (menuIconRef.current) {
      menuIconRef.current.classList.toggle('active');
    }
  };

  return (
    <div
      className="header w-full min-h-screen relative"
      style={{
        background: 'linear-gradient(60deg, #fcd1e8 0%, #dccbf8 100%)', // うすピンク→薄紫
      }}
    >
      {/* ヘッダー */}
      <AppHeader showBackButton={false} />

      {isLoading ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">データを読み込み中...</p>
          </div>
        </div>
      ) : (
        <>
          {/* ===================== ハンバーガーメニュー + Nav ===================== */}
          <header ref={headerRef} className="cd-header mt-8 pt-4">
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
            height: '100vh',
            width: '100%',
            zIndex: 98,
            overflow: 'hidden',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            visibility: isMenuActive ? 'visible' : 'hidden',
            opacity: isMenuActive ? 1 : 0,
            transition: 'all 0.3s ease-in-out',
          }}>
            <style jsx>{`
              .nav__list-item {
                position: relative;
                display: block;
                transition-delay: 0.8s;
                opacity: ${isMenuActive ? 1 : 0};
                transform: ${isMenuActive ? 'translateY(0%)' : 'translateY(40px)'};
                transition: opacity 0.3s ease, transform 0.3s ease;
                margin-bottom: 5px;
              }
              .department-link {
                position: relative;
                text-decoration: none;
                color: rgba(255,255,255,0.6);
                overflow: hidden;
                cursor: pointer;
                padding: 10px 16px !important;
                font-size: 16px !important;
                line-height: 1.5 !important;
                min-height: 40px !important;
                display: flex !important;
                align-items: center !important;
                background-color: transparent !important;
              }
            `}</style>
            <ul className="nav__list" style={{
              position: 'fixed',
              top: headerRef.current ? `${headerRef.current.offsetTop + headerRef.current.offsetHeight + 20}px` : '8rem',
              left: '50px',
              width: '280px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              listStyle: 'none',
              padding: '0.5rem',
              margin: 0,
              maxHeight: '80vh', // 背景より少し小さく
              overflowY: 'auto',
              zIndex: 99,
              visibility: isMenuActive ? 'visible' : 'hidden',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.5) rgba(0, 0, 0, 0.3)',
            }}>
              {departments.length === 0 ? (
                <li style={{ color: 'white', padding: '1rem', textAlign: 'center' }}>
                  部署が見つかりません
                </li>
              ) : (
                <>
                  <li style={{ 
                    color: 'white', 
                    padding: '0.5rem', 
                    textAlign: 'center', 
                    borderBottom: '1px solid rgba(255,255,255,0.2)',
                    minHeight: '30px',
                  }}>
                    部署一覧 (全{departments.length}件)
                  </li>
                  {departments.map((dept) => (
                    <li key={dept.id} className="nav__list-item">
                      <Link
                        href={`/taskpick?department=${encodeURIComponent(dept.name)}&departmentId=${dept.id}`}
                        className={`
                          department-link
                          rounded-lg 
                          transition-colors
                          block
                          text-white
                          hover:bg-white/10
                          ${activeDept === dept.id
                            ? 'bg-white/20'
                            : 'bg-transparent'
                          }
                        `}
                        onClick={() => setActiveDept(dept.id)}
                      >
                        {dept.name}
                      </Link>
                    </li>
                  ))}
                </>
              )}
            </ul>
          </div>

          {/* メインコンテンツ */}
          <div className="inner-header flex">
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
        </>
      )}
    </div>
  );
}
