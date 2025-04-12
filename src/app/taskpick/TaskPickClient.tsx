'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ThermometerSnowflake, Wrench, ChartLine, FlaskRound, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/ui/app-header';
import { supabase } from '@/lib/supabaseClient'; 
import { useAuth } from '@/contexts/AuthContext';

// 通知の型定義
interface Notification {
  id: number;
  type: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
}

// カスタムツールチップスタイル
const tooltipContentClass = "bg-primary border-primary";
const tooltipStyle = { backgroundColor: '#8167a9', color: 'white', border: '1px solid #8167a9' };
const tooltipTextStyle = { color: 'white' };

const menuItems = [
  {
    title: 'Temperature Records & Monitoring',
    description: 'Monitor and record temperature data',
    icon: ThermometerSnowflake,
    path: '/temperature',
    color: 'bg-dashboard-pink',
    tooltip: '温度記録の管理'
  },
  {
    title: 'Equipment Maintenance',
    description: 'Track and log maintenance tasks',
    icon: Wrench,
    path: '/equipment_dash',
    color: 'bg-dashboard-purple',
    tooltip: '機器メンテナンス管理'
  },
  {
    title: 'Quality Control Management',
    description: 'Manage quality control processes',
    icon: ChartLine,
    path: '/precision-management',
    color: 'bg-dashboard-pink',
    tooltip: '品質管理プロセス'
  },
  {
    title: 'Clinical Reagent Management',
    description: 'Track reagent inventory and usage',
    icon: FlaskRound,
    path: '/reagent_dash',
    color: 'bg-dashboard-purple',
    tooltip: '試薬在庫管理'
  },
];

export default function TaskPickClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || 'Department';
  const departmentId = searchParams?.get('departmentId') || '';
  const { user, profile } = useAuth();
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  // サンプル通知
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
    }
  ]);

  // ユーザー情報と施設情報の取得
  const fetchUserAndFacilityInfo = useCallback(async () => {
    try {
      // プロファイル情報からユーザー名を取得
      if (profile?.fullname) {
        setCurrentUserName(profile.fullname);
      }
      
      // 施設情報を取得
      if (profile?.facility_id) {
        const { data: facilityData, error: facilityError } = await supabase
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
  }, [profile]);

  // コンポーネントマウント時にユーザー情報と施設情報を取得
  useEffect(() => {
    fetchUserAndFacilityInfo();
  }, [fetchUserAndFacilityInfo]);

  const handleCardClick = (path: string) => {
    router.push(
      `${path}?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`
    );
  };

  return (
    <TooltipProvider 
      delayDuration={300}
      skipDelayDuration={0}
    >
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
        {/* 共通ヘッダーコンポーネントを使用 */}
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
                  {notifications.map((notification) => (
                    <li key={`notification-${notification.id}`} className="text-sm text-yellow-700 mb-1">
                      {notification.message}
                      <span className="text-xs text-muted-foreground ml-2">
                        {notification.timestamp.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ユーザー情報表示 */}
        <div className="w-full px-4 py-2">
          <div className="text-right">
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

        {/* メインコンテンツ */}
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
                    color: '#ffffff',
                    textShadow: '-1px -1px 0 #666, 1px -1px 0 #666, -1px 1px 0 #666, 1px 1px 0 #666',
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
              {menuItems.map((item, index) => (
                <Tooltip key={item.title}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleCardClick(item.path)}
                      className="cursor-pointer"
                    >
                      <Card
                        className={`relative overflow-hidden group cursor-pointer transition-all duration-300 hover:shadow-lg ${item.color} hover:bg-dashboard-hover`}
                      >
                        {/* --- SVG 波形 --- */}
                        <div className="absolute left-0 w-full pointer-events-none z-0 top-auto bottom-0 h-15">
                          <svg
                            className="waves w-full h-auto"
                            xmlns="http://www.w3.org/2000/svg"
                            xmlnsXlink="http://www.w3.org/1999/xlink"
                            viewBox="0 24 150 28"
                            preserveAspectRatio="none"
                            shapeRendering="auto"
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
                        {/* --- /SVG 波形 --- */}

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
                  <TooltipContent className={`${tooltipContentClass} tooltip-content`} style={tooltipStyle}>
                    <p style={tooltipTextStyle}>{item.tooltip}</p>
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
