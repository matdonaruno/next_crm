'use client';

import { useRouter } from 'next/navigation';
import { User, Home, LogOut, ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { CompactLoadingSpinner } from '@/components/common/LoadingSpinner';

// 通知コンポーネントを動的にインポート（サーバーサイドレンダリングを無効化）
const UserNotifications = dynamic(() => import('@/components/UserNotifications'), {
  ssr: false,
  loading: () => <div className="w-8 h-8 flex items-center justify-center"><CompactLoadingSpinner /></div>,
});

interface AppHeaderProps {
  showBackButton?: boolean;
  title?: string;
  onBackClick?: () => void;
  icon?: ReactNode;
  className?: string;
}

// カスタムツールチップスタイル
const tooltipContentClass = "bg-primary border-primary";
const tooltipStyle = { backgroundColor: '#8167a9', color: 'white', border: '1px solid #8167a9' };
const tooltipTextStyle = { color: 'white' };

export function AppHeader({ showBackButton = true, title, onBackClick, icon, className }: AppHeaderProps) {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // ユーザーの権限を確認
  useEffect(() => {
    if (!loading && profile) {
      console.log('ユーザープロフィール (詳細):', JSON.stringify(profile, null, 2));
      console.log('プロフィールのキー:', Object.keys(profile));
      console.log('ユーザーロール:', profile.role);
      
      if (profile.role === 'superuser' || profile.role === 'facility_admin') {
        setIsAdmin(true);
        console.log('管理者権限を確認しました。isAdmin:', true);
      } else {
        setIsAdmin(false);
        console.log('一般ユーザー権限を確認しました。isAdmin:', false, 'ロール値:', profile.role);
      }
    } else {
      console.log('ロード中またはプロフィールがありません:', { loading, profile });
    }
  }, [profile, loading]);

  // 前の画面に戻る関数
  const handleGoBack = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      router.back();
    }
  };

  return (
    <header className={`bg-white text-primary shadow-sm w-full ${className || ''}`}>
      <div className="w-full px-4 py-3 flex items-center">
        {/* 戻るアイコン - 左端に配置 */}
        {showBackButton && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleGoBack} className="mr-2 -ml-3">
                  <ArrowLeft className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                <p style={tooltipTextStyle}>戻る</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* タイトル - 中央に配置 */}
        <div className="flex-1 text-center flex items-center justify-center">
          {icon && <span className="mr-2">{icon}</span>}
          {title && <h1 className="text-xl font-bold">{title}</h1>}
        </div>
        
        {/* 右側のアイコン群 - 右詰めに配置 */}
        <div className="flex items-center space-x-1">
          {/* 通知アイコン */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <UserNotifications />
              </TooltipTrigger>
              <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                <p style={tooltipTextStyle}>通知</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* ユーザー管理アイコン（管理者のみ表示） */}
          {isAdmin && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => router.push("/admin/user-management")}>
                    <Users className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                  <p style={tooltipTextStyle}>ユーザー管理</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* ユーザー設定アイコン */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  // 手動ナビゲーションフラグを設定
                  if (typeof window !== 'undefined') {
                    window.isManualNavigation = true;
                    console.log("手動でユーザー設定ページに移動します");
                  }
                  router.push("/user-settings");
                }}>
                  <User className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                <p style={tooltipTextStyle}>ユーザー設定</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* ホームアイコン */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => router.push("/depart")}>
                  <Home className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                <p style={tooltipTextStyle}>ホーム</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* ログアウトアイコン */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={signOut}>
                  <LogOut className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                <p style={tooltipTextStyle}>ログアウト</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  );
} 