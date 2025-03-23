'use client';

import { useRouter } from 'next/navigation';
import { User, Home, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ReactNode } from 'react';

interface AppHeaderProps {
  showBackButton?: boolean;
  title?: string;
  onBackClick?: () => void;
  icon?: ReactNode;
}

// カスタムツールチップスタイル
const tooltipContentClass = "bg-primary border-primary";
const tooltipStyle = { backgroundColor: '#8167a9', color: 'white', border: '1px solid #8167a9' };
const tooltipTextStyle = { color: 'white' };

export function AppHeader({ showBackButton = true, title, onBackClick, icon }: AppHeaderProps) {
  const router = useRouter();

  // 前の画面に戻る関数
  const handleGoBack = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      router.back();
    }
  };

  return (
    <header className="bg-white text-primary shadow-sm w-full">
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
          {icon && <span className="mr-4">{icon}</span>}
          {title && <h1 className="text-xl font-bold">{title}</h1>}
        </div>
        
        {/* 右側のアイコン群 - 右詰めに配置 */}
        <div className="flex items-center space-x-1">
          {/* ユーザー設定アイコン */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => router.push("/user-settings")}>
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
                <Button variant="ghost" size="icon" onClick={() => router.push("/login")}>
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