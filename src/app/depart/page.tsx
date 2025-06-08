// src/app/depart/page.tsx
'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AppHeader } from '@/components/ui/app-header'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Mic } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/components/SupabaseProvider';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

interface Department {
  id: string
  name: string
  facility_id: string | null
  created_at: string
}

export default function DepartPage() {
  const router   = useRouter()
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = useSupabase();
  const menuRef  = useRef<HTMLDivElement>(null)

  const [departments, setDepartments]       = useState<Department[]>([])
  const [facilityName, setFacilityName]     = useState('')
  const [currentUserName, setCurrentUserName] = useState('')

  const [isLoading, setIsLoading]                 = useState(true)
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true)
  const [error, setError]                         = useState<string | null>(null)
  const [isMenuActive, setIsMenuActive]           = useState(false)
  const [cssLoaded, setCssLoaded]                 = useState(false)

  // ① 認証チェック & プロフィール取得 & 部署一覧
  useEffect(() => {
    // AuthGateWrapperで認証済みの場合、追加の認証チェックをスキップ
    if (authLoading) return;
    if (!user) return;
    if (!profile) return;  // wait for context profile

    let ignore = false;
    (async () => {
      try {
        setError(null);
        // AuthGateWrapperで認証済みの場合、初期ローディングを短縮
        setIsLoading(false); // 認証関連は完了
        setIsLoadingDepartments(true);

        // Context profile data
        const prof = profile;
        setCurrentUserName(prof.fullname ?? '');

        if (!prof.facility_id) {
          if (!ignore) setError('施設情報が紐づいていません。管理者へ連絡してください。');
          return;
        }

        // 施設名取得
        const { data: fac } = await supabase
          .from('facilities')
          .select('name')
          .eq('id', prof.facility_id)
          .single();
        if (fac && !ignore) setFacilityName(fac.name);

        // 部署一覧取得
        const { data: depts, error: deptErr } = await supabase
          .from('departments')
          .select('*')
          .eq('facility_id', prof.facility_id);
        if (deptErr) throw deptErr;

        if (depts && !ignore) {
          setDepartments(
            depts.map((d: Department) => ({
              id: d.id,
              name: d.name,
              facility_id: d.facility_id,
              created_at: d.created_at ?? '',
            }))
          );
        }
      } catch (e: any) {
        if (!ignore) setError(e.message ?? String(e));
      } finally {
        if (!ignore) {
          setIsLoadingDepartments(false);
          // isLoadingは既に初期化時にfalseに設定済み
        }
      }
    })();
    return () => { ignore = true; };
  }, [user, profile, supabase])

  // ② CSSの読み込み確認
  useEffect(() => {
    // スタイルシートが読み込まれたか確認
    const checkStylesLoaded = () => {
      const stylesheets = document.styleSheets;
      let menuCssLoaded = false;
      let wavesCssLoaded = false;
      
      // スタイルシートを確認
      for (let i = 0; i < stylesheets.length; i++) {
        try {
          const href = stylesheets[i].href;
          if (href && href.includes('menu.css')) menuCssLoaded = true;
          if (href && href.includes('simple-css-waves.css')) wavesCssLoaded = true;
        } catch (e) {
          // CSSOMのセキュリティ制限で読めない場合も考慮
        }
      }
      
      // 両方のCSSが読み込まれているか、一定時間経過したら表示
      if (menuCssLoaded && wavesCssLoaded) {
        setCssLoaded(true);
      } else {
        // スタイルシートにアクセスできない場合のフォールバック
        // computedStyleでCSSが適用されているか確認
        const testElement = document.createElement('div');
        testElement.className = 'menu-icon__line';
        document.body.appendChild(testElement);
        const computedStyle = window.getComputedStyle(testElement);
        const hasMenuStyles = computedStyle.height === '1px' || computedStyle.height === '0.0625rem';
        document.body.removeChild(testElement);
        
        if (hasMenuStyles) {
          setCssLoaded(true);
        }
      }
    };
    
    // 初回チェック
    checkStylesLoaded();
    
    // まだ読み込まれていない場合は、定期的にチェック
    if (!cssLoaded) {
      const interval = setInterval(() => {
        checkStylesLoaded();
      }, 50);
      
      // 最大1秒待つ
      const timeout = setTimeout(() => {
        setCssLoaded(true);
        clearInterval(interval);
      }, 1000);
      
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
    
    return () => {
      // nav-activeクラスを削除
      document.body.classList.remove('nav-active');
    }
  }, [cssLoaded])


  // ④ メニュー開閉
  const toggleMenu = () => {
    document.body.classList.toggle('nav-active')
    setIsMenuActive((v) => !v)
  }

  // AuthGateWrapperで認証中の場合はそちらに任せる
  if (authLoading) {
    return null; // AuthGateWrapperがローディング表示を担当
  }
  
  if (isLoadingDepartments || !cssLoaded) {
    return <LoadingSpinner message="部署情報を読み込み中..." fullScreen />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'linear-gradient(60deg,#fcd1e8 0%,#dccbf8 100%)' }}>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div
      className="header w-full min-h-screen relative"
      style={{ background: 'linear-gradient(60deg,#fcd1e8 0%,#dccbf8 100%)' }}
    >
      <AppHeader showBackButton={false} />

      {/* ヘッダー */}
      <header className="cd-header mt-8 pt-4">
        <div className="header-wrapper">
          <div className="logo-wrap">
            <a className="hover-target" href="#"><span>life has</span>limit</a>
            <div className="mb-4 text-right">
              {facilityName && <p className="text-sm text-gray-600">施設「{facilityName}」</p>}
              {currentUserName && <p className="text-sm text-gray-600">{currentUserName} さん</p>}
            </div>
          </div>
          <div className="nav-but-wrap">
            <div ref={menuRef} onClick={toggleMenu} className="menu-icon hover-target">
              <span className="menu-icon__line menu-icon__line-left" />
              <span className="menu-icon__line" />
              <span className="menu-icon__line menu-icon__line-right" />
            </div>
          </div>
        </div>
      </header>

      {/* サイドメニュー */}
      <div
        className={`nav ${isMenuActive ? 'nav-active' : ''}`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10,
          opacity: isMenuActive ? 1 : 0,
          visibility: isMenuActive ? 'visible' : 'hidden',
          transition: 'all .3s',
        }}
      >
        <div className="nav__content">
          <div className="text-white text-xl font-bold px-6 py-8 border-b border-white/20">
            部署一覧 (全{departments.length}件)
          </div>
          <div className="custom-scrollbar" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            <ul className="nav__list">
              {departments.map((d) => (
                <li key={d.id} className="nav__list-item py-2">
                  <Link
                    className="block px-6 py-2 rounded-lg text-white hover:bg-white/10 transition-colors"
                    href={`/taskpick?department=${encodeURIComponent(d.name)}&departmentId=${d.id}`}
                  >
                    {d.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 会議録アイコン */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/meeting-minutes')}
                className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition"
              >
                <Mic className="h-6 w-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="bg-primary border-primary">
              <p style={{ color: '#fff' }}>会議議事録</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* メインコピー */}
      <div className="inner-header flex mt-8 text-center flex-col items-center">
        <div className="text-2xl font-bold" style={{ color: '#8167a9' }}>Labo Logbook</div>
        <div className="text-xl mt-40" style={{ color: '#8167a9' }}>メニューから部署を選択してはじめましょう</div>
      </div>

      {/* 波 */}
      <svg
        className="waves"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 24 150 28"
        preserveAspectRatio="none"
      >
        <defs>
          <path
            id="gentle-wave"
            d="M-160 44c30 0 58-18 88-18s58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
          />
        </defs>
        <g className="parallax">
          <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(255,255,255,.7)" />
          <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(255,255,255,.5)" />
          <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(255,255,255,.3)" />
          <use xlinkHref="#gentle-wave" x="48" y="7" fill="#fff" />
        </g>
      </svg>

      <div className="content flex justify-center py-4">
        <p>for your side partner | designed By.Goodkatz</p>
      </div>
    </div>
  )
}
