'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ThermometerSnowflake,
  Wrench,
  ChartLine,
  FlaskRound,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/ui/app-header';
import { useAuth } from '@/contexts/AuthContext';
import type { Session, User } from '@supabase/supabase-js';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useFacilityName } from '@/hooks/use-facility';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { formatJSTDateTime } from '@/lib/utils';

// --- 型定義 ---
interface Notification {
  id: number;
  type: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
}

// AuthContextから取得されるuser型は既に適切に型付けされているため、削除

// メニューアイテム型
interface MenuItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  color: string;
  tooltip: string;
}

const menuItems: MenuItem[] = [
  {
    title: 'Temperature Records & Monitoring',
    description: 'Monitor and record temperature data',
    icon: ThermometerSnowflake,
    path: '/temperature',
    color: 'bg-dashboard-pink',
    tooltip: '温度記録の管理',
  },
  {
    title: 'Equipment Maintenance',
    description: 'Track and log maintenance tasks',
    icon: Wrench,
    path: '/equipment_dash',
    color: 'bg-dashboard-purple',
    tooltip: '機器メンテナンス管理',
  },
  {
    title: 'Quality Control Management',
    description: 'Manage quality control processes',
    icon: ChartLine,
    path: '/precision-management',
    color: 'bg-dashboard-pink',
    tooltip: '品質管理プロセス',
  },
  {
    title: 'Clinical Reagent Management',
    description: 'Track reagent inventory and usage',
    icon: FlaskRound,
    path: '/reagent_dash',
    color: 'bg-dashboard-purple',
    tooltip: '試薬在庫管理',
  },
];

export default function TaskPickClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // searchParamsが初期化されるまで待つ
  const [isReady, setIsReady] = useState(false);
  
  // AuthContextからセッション情報を取得
  const { user, session, loading: authLoading } = useAuth();
  
  // fetch user profile and facility
  const { profile, loading: profileLoading, error: profileError } = useUserProfile();
  const { name: facilityName, loading: facilityLoading, error: facilityError } = useFacilityName(profile?.facility_id ?? '');

  // サンプル通知 - 条件分岐の前に配置
  const [notifications] = useState<Notification[]>([
    {
      id: 1,
      type: 'warning',
      message: '温度記録が3日間更新されていません',
      timestamp: new Date(),
    },
    {
      id: 2,
      type: 'info',
      message: '新しい試薬が登録されました',
      timestamp: new Date(),
    },
  ]);

  const departmentName = searchParams?.get('department') ?? '';
  const departmentId = searchParams?.get('departmentId') ?? '';

  useEffect(() => {
    setIsReady(true);
  }, []);

  // 認証されていない場合はログインページにリダイレクト
  useEffect(() => {
    if (isReady && !authLoading && !profileLoading && !session) {
      router.push('/login');
    }
  }, [isReady, authLoading, profileLoading, session, router]);

  // プロファイルがロード中、またはプロファイルがロード済みで施設IDがある場合のみ施設名をロード
  const shouldWaitForFacility = profileLoading || (profile?.facility_id && facilityLoading);
  
  // 初期化待ち
  if (!isReady) {
    return <LoadingSpinner message="初期化中..." fullScreen />;
  }
  
  if (authLoading || !session || !user || profileLoading || shouldWaitForFacility) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-100 to-purple-100">
        <div className="text-center">
          <LoadingSpinner message="データを読み込み中..." />
          {profileError && <p className="text-red-500 mt-4">プロファイルの読み込みエラー: {profileError.message}</p>}
          {facilityError && <p className="text-red-500 mt-4">施設情報の読み込みエラー: {facilityError.message}</p>}
        </div>
      </div>
    );
  }

  const handleCardClick = (path: string) => {
    router.push(
      `${path}?department=${encodeURIComponent(departmentName)}&departmentId=${encodeURIComponent(
        departmentId
      )}`
    );
  };

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <style jsx global>{`
        .tooltip-content {
          background-color: #8167a9 !important;
          color: white !important;
          border: 1px solid #8167a9 !important;
        }
        .tooltip-content p {
          color: white !important;
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col bg-gradient-to-b from-[#fffafd] to-[#faf8fe]">
        <AppHeader showBackButton={true} />

        {/* 通知欄 */}
        {notifications.length > 0 && (
          <div className="w-full px-4 py-3 mt-2">
            <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
                <AlertTriangle className="inline-block mr-2 h-5 w-5" />
                通知 ({notifications.length}件)
              </h3>
              <div className="max-h-40 overflow-y-auto">
                <ul className="list-disc pl-5 text-left">
                  {notifications.map((n) => (
                    <li key={n.id} className="text-sm text-yellow-700 mb-1">
                      {n.message}
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatJSTDateTime(n.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ユーザー情報 */}
        <div className="w-full px-4 py-2">
          <div className="text-right">
            {!!facilityName && (
              <p className="text-sm text-gray-600">施設「{facilityName}」</p>
            )}
            {!!profile?.fullname && (
              <p className="text-sm text-gray-600">{profile.fullname}さんがログインしています！</p>
            )}
          </div>
        </div>

        {/* メイン */}
        <div className="flex-grow flex flex-col items-center justify-center py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <h1
                className="titlefont text-4xl font-bold mb-4"
                style={{ color: '#8167a9' }}
              >
                Labo Logbook{' '}
                <span
                  style={{
                    color: '#fff',
                    textShadow:
                      '-1px -1px 0 #666, 1px -1px 0 #666, -1px 1px 0 #666, 1px 1px 0 #666',
                  }}
                >
                  Dashboard
                </span>
              </h1>
              <h2
                className="cutefont text-3xl mb-4"
                style={{ color: '#8167a9' }}
              >
                『{departmentName}』
              </h2>
              <p className="titlefont text-lg" style={{ color: '#8167a9' }}>
                Select a category to manage your records
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {menuItems.map((item, idx) => (
                <Tooltip key={item.title}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      onClick={() => handleCardClick(item.path)}
                      className="cursor-pointer"
                    >
                      <Card
                        className={`relative overflow-hidden group cursor-pointer transition-all duration-300 hover:shadow-lg ${item.color} hover:bg-dashboard-hover`}
                      >
                        <div className="absolute left-0 w-full pointer-events-none z-0 top-auto bottom-0 h-15">
                          <svg
                            className="waves w-full h-auto"
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
                              <use
                                xlinkHref="#gentle-wave"
                                x="48"
                                y="0"
                                fill="rgba(255,255,255,0.7)"
                              />
                              <use
                                xlinkHref="#gentle-wave"
                                x="48"
                                y="3"
                                fill="rgba(255,255,255,0.5)"
                              />
                              <use
                                xlinkHref="#gentle-wave"
                                x="48"
                                y="5"
                                fill="rgba(255,255,255,0.3)"
                              />
                              <use
                                xlinkHref="#gentle-wave"
                                x="48"
                                y="7"
                                fill="#fff"
                              />
                            </g>
                          </svg>
                        </div>

                        <div className="p-6 flex flex-col items-center text-center gap-4 relative z-10">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                              <item.icon className="w-6 h-6 text-[#8167a9] group-hover:text-pink-500 transition-colors duration-300" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-[#8167a9] mb-2 group-hover:text-pink-600 transition-colors duration-300">
                              {item.title}
                            </h3>
                            <p className="text-sm text-[#8167a9] group-hover:text-gray-900 transition-colors duration-300">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent className="tooltip-content">
                    <p>{item.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
