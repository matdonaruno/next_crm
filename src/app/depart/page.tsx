'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import supabaseClient from '@/lib/supabaseClient'; 
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/ui/app-header';
import { cacheDepartments, getCachedDepartments } from '@/lib/departmentCache';
import { setSessionCheckEnabled } from '@/contexts/AuthContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Mic } from 'lucide-react';

// カスタムツールチップスタイル
const tooltipContentClass = "bg-primary border-primary";
const tooltipStyle = { backgroundColor: '#8167a9', color: 'white', border: '1px solid #8167a9' };
const tooltipTextStyle = { color: 'white' };

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
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const menuIconRef = useRef<HTMLDivElement>(null);
  
  // セッション確認を無効化
  useEffect(() => {
    setSessionCheckEnabled(false);
  }, []);
  
  // 認証とプロファイルチェックe
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log("DepartPage: 認証チェック開始", { 
          loading, 
          userId: user?.id || 'なし',
          hasProfile: !!profile,
          timestamp: new Date().toISOString()
        });

        // 認証状態のロードが完了していない場合は待機
        if (loading) {
          console.log("DepartPage: 認証状態ロード中...");
          return;
        }

        // セッションを明示的に確認
        const { data: sessionData } = await supabaseClient.auth.getSession();
        console.log("DepartPage: セッション確認結果", { 
          hasSession: !!sessionData.session,
          sessionUserId: sessionData.session?.user?.id || 'なし',
          contextUserId: user?.id || 'なし',
          timestamp: new Date().toISOString()
        });

        // テーブル構造を確認
        try {
          console.log("DepartPage: テーブル構造を確認します");
          const { data: tableData, error: tableError } = await supabaseClient
            .from('departments')
            .select('*')
            .limit(1);
          
          if (tableError) {
            console.error("DepartPage: テーブル構造確認エラー:", tableError.message, tableError.details);
          } else {
            console.log("DepartPage: テーブル構造:", tableData);
          }
        } catch (tableError) {
          console.error("DepartPage: テーブル構造確認中に例外が発生:", tableError);
        }

        // 認証されていない場合はログインページにリダイレクト
        if (!user) {
          console.log("DepartPage: ユーザーが認証されていません。ログインページへリダイレクト");
          router.push("/login");
          return;
        }

        // フルネームまたは施設IDが設定されていない場合は警告を出すだけ（リダイレクトしない）
        if (!profile?.fullname || !profile?.facility_id) {
          console.log("DepartPage: プロファイル情報が不完全ですが、処理を続行します", {
            fullname: profile?.fullname || 'なし',
            facility_id: profile?.facility_id || 'なし'
          });
        }

        console.log("DepartPage: 認証チェック完了 - ユーザーは認証済み", {
          userId: user.id,
          fullname: profile?.fullname || 'なし',
          facility_id: profile?.facility_id || 'なし'
        });
        setIsLoading(false);
      } catch (error) {
        console.error("DepartPage: 認証チェックエラー:", error);
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [user, profile, loading, router]);
  
  // 部署データの取得
  const fetchDepartments = useCallback(async () => {
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
      
      // まず、すべての部署を取得してみる（デバッグ用）
      console.log("デバッグ: すべての部署データを取得します");
      try {
        const { data: allDepts, error: allError } = await supabaseClient
          .from("departments")
          .select('*')
          .limit(20);
          
        if (allError) {
          console.error("デバッグ: すべての部署データ取得エラー:", allError.message, allError.details, allError.hint);
        } else {
          console.log("デバッグ: すべての部署データ取得成功:", allDepts?.length || 0, "件");
          console.log("デバッグ: 最初の部署データ:", allDepts?.[0] || "なし");
        }
      } catch (debugError) {
        console.error("デバッグ: 部署データ取得中に例外が発生:", debugError);
      }
      
      // 施設IDに基づいて部署を取得（直接クエリ）
      console.log("Supabaseクエリを実行: departments.select().eq('facility_id', '" + cleanFacilityId + "')");
      const { data, error } = await supabaseClient
        .from("departments")
        .select('*')
        .eq('facility_id', cleanFacilityId);
        
      if (error) {
        console.error("部署データの取得エラー:", error.message, error.details, error.hint);
        
        // エラー時にキャッシュデータを使用
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) {
          console.log("エラーが発生したため、キャッシュから部署データを使用します");
          setDepartments(cached);
          // 最初の部署を自動選択しない
          // setActiveDept(cached[0].id);
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
      } else {
        console.log("施設IDに一致する部署が見つかりません。すべての部署を取得します。");
        // バックアップとして、すべての部署を試す
        console.log("Supabaseクエリを実行: departments.select('*')");
        const { data: allDepts, error: allError } = await supabaseClient
          .from("departments")
          .select('*');
          
        if (allError) {
          console.error("すべての部署データの取得エラー:", allError.message, allError.details, allError.hint);
        }
          
        if (!allError && allDepts && allDepts.length > 0) {
          console.log("すべての部署データを表示します:", allDepts);
          cacheDepartments(allDepts);
          setDepartments(allDepts);
        } else {
          console.log("部署データが見つかりません。手動でデータを作成します。");
          // 部署データが見つからない場合は、ダミーデータを作成
          const dummyDepts = [
            { id: "1", name: "内科", facility_id: cleanFacilityId },
            { id: "2", name: "外科", facility_id: cleanFacilityId },
            { id: "3", name: "小児科", facility_id: cleanFacilityId },
            { id: "4", name: "産婦人科", facility_id: cleanFacilityId }
          ];
          console.log("ダミー部署データを作成:", dummyDepts);
          cacheDepartments(dummyDepts);
          setDepartments(dummyDepts);
        }
      }
    } catch (fetchError) {
      console.error("部署データ取得中に例外が発生しました:", fetchError);
      
      // 例外発生時にキャッシュデータを使用
      const cached = getCachedDepartments();
      if (cached && cached.length > 0) {
        console.log("例外が発生したため、キャッシュから部署データを使用します");
        setDepartments(cached);
        // 最初の部署を自動選択しない
        // setActiveDept(cached[0].id);
      } else {
        console.log("キャッシュデータもないため、ダミーデータを作成します。");
        // キャッシュデータもない場合は、ダミーデータを作成
        const dummyDepts = [
          { id: "1", name: "内科", facility_id: profile.facility_id },
          { id: "2", name: "外科", facility_id: profile.facility_id },
          { id: "3", name: "小児科", facility_id: profile.facility_id },
          { id: "4", name: "産婦人科", facility_id: profile.facility_id }
        ];
        console.log("ダミー部署データを作成:", dummyDepts);
        cacheDepartments(dummyDepts);
        setDepartments(dummyDepts);
      }
    } finally {
      setIsLoading(false);
    }
  }, [loading, profile, setIsLoading]);

  // ユーザー情報と施設情報の取得
  const fetchUserAndFacilityInfo = useCallback(async () => {
    if (!user) return;
    try {
      // プロファイル情報からユーザー名を取得
      if (profile?.fullname) {
        setCurrentUserName(profile.fullname);
      }
      
      // 施設情報を取得
      if (profile?.facility_id) {
        const { data: facilityData, error: facilityError } = await supabaseClient
          .from("facilities")
          .select("name")
          .eq("id", profile.facility_id)
          .single();
          
        if (!facilityError && facilityData) {
          setFacilityName(facilityData.name);
        }
      }
    } catch (error) {
      console.error("ユーザーおよび施設情報取得エラー:", error);
    }
  }, [user, profile]);

  // コンポーネントマウント時にユーザー情報と施設情報を取得
  useEffect(() => {
    if (!loading && user && profile) {
      fetchUserAndFacilityInfo();
    }
  }, [loading, user, profile, fetchUserAndFacilityInfo]);

  // 部署データ取得の実行
  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);
  
  // タイムアウト処理を追加
  useEffect(() => {
    // 最大10秒後にはロード状態を解除し、キャッシュを確認
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.log("部署データ取得がタイムアウトしました。強制的にロード状態を解除します。");
        
        // タイムアウト時にキャッシュデータを使用
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) {
          console.log("タイムアウトのため、キャッシュから部署データを使用します");
          setDepartments(cached);
          // 最初の部署を自動選択しない
          // setActiveDept(cached[0].id);
        } else {
          console.log("タイムアウト時にキャッシュデータがないため、ダミーデータを作成します。");
          // キャッシュデータもない場合は、ダミーデータを作成
          const dummyDepts = [
            { id: "1", name: "内科", facility_id: "dummy" },
            { id: "2", name: "外科", facility_id: "dummy" },
            { id: "3", name: "小児科", facility_id: "dummy" },
            { id: "4", name: "産婦人科", facility_id: "dummy" }
          ];
          console.log("タイムアウト時にダミー部署データを作成:", dummyDepts);
          cacheDepartments(dummyDepts);
          setDepartments(dummyDepts);
        }
        
        setIsLoading(false);
      }
    }, 10000); // 10秒でタイムアウト
    
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
            <div className="mb-4 text-right">
              {facilityName && (
                <p className="text-sm text-gray-600">
                  施設「{facilityName}」
                </p>
              )}
              {currentUserName && (
                <p className="text-sm text-gray-600">
                  {currentUserName}さんがログインしています！
                </p>
              )}
            </div>
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
          {/* 部署一覧の見出し */}
          <div className="text-white text-xl font-bold px-6 py-4 border-b border-white/20">
            部署一覧 (全{departments.length}件)
          </div>
          
          {/* スクロール可能なリスト */}
          <div 
            className="custom-scrollbar"
            style={{
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
              paddingBottom: '2rem',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)'
            }}
          >
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
      </div>

      {/* フローティング会議議事録アイコン */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/meeting-minutes')}
                className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg hover:shadow-xl transition-shadow duration-300 text-white"
                aria-label="会議議事録"
              >
                <Mic className="h-6 w-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
              <p style={tooltipTextStyle}>会議議事録</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ===================== メインコンテンツ ===================== */}
      <div className="inner-header flex mt-8">
        <center>
            <div className="text-2xl font-bold" style={{ color: '#8167a9' }}>Labo Logbook</div>
        </center>
      </div>

      <div>
        <center>
            <div className="text-1xl" style={{ color: '#8167a9' }}>メニューから部署を選択してはじめましょう</div>
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
