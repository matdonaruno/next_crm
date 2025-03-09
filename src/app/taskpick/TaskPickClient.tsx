'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ThermometerSnowflake, Wrench, ChartLine, FlaskRound, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { LucideIcon } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-header';

// カスタムツールチップスタイル
const tooltipContentClass = "bg-white text-pink-600";
const tooltipStyle = { 
  backgroundColor: 'white', 
  color: '#db2777', // text-pink-600の色コード
  border: '1px solid #f9d5e5',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  padding: '8px 12px',
  borderRadius: '6px'
};

// タスクの型定義
interface Task {
  id: string;
  title: string;
  description: string;
  created_at: string;
  [key: string]: unknown;
}

// アイコンマッピング
const iconMapping: Record<string, LucideIcon> = {
  'Temperature Records': ThermometerSnowflake,
  'Equipment Maintenance': Wrench,
  'Quality Control': ChartLine,
  'Clinical reagent manager': FlaskRound,
  // デフォルトアイコン
  'default': ChartLine
};

// パスマッピング
const pathMapping: Record<string, string> = {
  'Temperature Records': '/temperature',
  'Equipment Maintenance': '/equipment',
  'Quality Control': '/quality',
  'Clinical reagent manager': '/reagent_dash',
  // デフォルトパス
  'default': '/'
};

// 色のマッピング（交互に色を変える）
const getCardColor = (index: number): string => {
  return index % 2 === 0 ? 'bg-dashboard-pink' : 'bg-dashboard-purple';
};

export default function TaskPickClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const departmentName = searchParams?.get('department') || 'Department';
  const departmentId = searchParams?.get('departmentId') || '';
  const currentUserName = profile?.fullname || '';

  // キャッシュからタスクを取得する関数
  const getCachedTasks = () => {
    if (typeof window === 'undefined') return null;
    try {
      const cachedTasksStr = localStorage.getItem('cached_tasks');
      const cachedFacilityId = localStorage.getItem('cached_facility_id');
      
      // 施設IDが一致する場合のみキャッシュを使用
      if (cachedTasksStr && cachedFacilityId === profile?.facility_id) {
        console.log("キャッシュからタスクデータを取得します");
        return JSON.parse(cachedTasksStr) as Task[];
      }
      return null;
    } catch (error) {
      console.error("キャッシュからのタスク取得エラー:", error);
      return null;
    }
  };

  // タスクをキャッシュに保存する関数
  const cacheTasks = (tasksToCache: Task[]) => {
    if (typeof window === 'undefined' || !profile?.facility_id) return;
    try {
      localStorage.setItem('cached_tasks', JSON.stringify(tasksToCache));
      localStorage.setItem('cached_facility_id', profile.facility_id);
      console.log("タスクデータをキャッシュに保存しました");
    } catch (error) {
      console.error("タスクキャッシュ保存エラー:", error);
    }
  };

  // タスクデータの取得
  useEffect(() => {
    let isMounted = true;
    let isDataFetched = false; // データ取得完了フラグを追加
    
    const fetchTasks = async () => {
      // すでにデータ取得が完了している場合はスキップ
      if (isDataFetched) {
        return;
      }
      
      // 認証情報のロード中は何もしない
      if (loading) {
        console.log("認証情報のロード中です。タスクデータの取得を待機します。");
        return;
      }

      if (!user) {
        console.log("ユーザーが認証されていません。ログインページにリダイレクトします。");
        router.push('/login');
        return;
      }

      if (!profile?.facility_id) {
        console.warn("施設IDが設定されていません。タスクデータを取得できない可能性があります。");
        if (isMounted) setIsLoading(false);
        return;
      }

      // キャッシュチェック（初回のみ）
      if (!isDataFetched && !isLoading) {
        const cached = getCachedTasks();
        if (cached && cached.length > 0) {
          console.log("キャッシュからタスクデータを表示します（" + cached.length + "件）");
          if (isMounted) {
            setTasks(cached);
            setIsLoading(false);
            isDataFetched = true;
            return;
          }
        }
      }

      try {
        if (isMounted) setIsLoading(true);
        
        console.log("Supabaseからタスクデータを取得します...");
        console.log("施設ID:", profile.facility_id);

        // 直接tasksテーブルを使用する（tasks_with_usersビューは使わない）
        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select('id, title, description, created_at, status, department_id')
          .eq('facility_id', profile.facility_id)
          .order('created_at', { ascending: false });

        if (tasksError) {
          console.error("タスクデータの取得エラー:", tasksError);
          console.error("エラーの詳細:", tasksError.message, tasksError.details, tasksError.hint);
          
          // エラー発生時にキャッシュがあればそれを使用
          const cached = getCachedTasks();
          if (cached && cached.length > 0) {
            console.log("エラーが発生したため、キャッシュからのタスクデータを使用します");
            if (isMounted) setTasks(cached);
          } else {
            // キャッシュもなければサンプルタスク
            console.log("エラーが発生し、キャッシュもないため、サンプルタスクを使用します");
            if (isMounted) setTasks(getSampleTasks());
          }
        } else {
          console.log("取得したタスクデータ:", tasksData);
          console.log("タスクの総数:", tasksData?.length || 0);
          
          // データが空の場合
          if (!tasksData || tasksData.length === 0) {
            console.log("タスクデータが見つかりませんでした。");
            
            // キャッシュがあればそれを使用
            const cached = getCachedTasks();
            if (cached && cached.length > 0) {
              console.log("キャッシュからのタスクデータを使用します");
              if (isMounted) setTasks(cached);
            } else {
              // キャッシュもなければサンプルタスク
              console.log("サンプルタスクを使用します");
              if (isMounted) setTasks(getSampleTasks());
            }
          } else {
            // 取得したデータをキャッシュに保存
            cacheTasks(tasksData);
            if (isMounted) setTasks(tasksData);
          }
        }
        
        // データ取得完了フラグをセット
        isDataFetched = true;
      } catch (error) {
        console.error("タスクデータ取得中にエラーが発生しました:", error);
        // エラーの詳細をログに出力
        if (error instanceof Error) {
          console.error("エラーメッセージ:", error.message);
          console.error("エラースタック:", error.stack);
        }
        
        // エラー発生時にキャッシュがあればそれを使用
        const cached = getCachedTasks();
        if (cached && cached.length > 0) {
          console.log("例外が発生したため、キャッシュからのタスクデータを使用します");
          if (isMounted) setTasks(cached);
        } else {
          // キャッシュもなければサンプルタスク
          console.log("例外が発生し、キャッシュもないため、サンプルタスクを使用します");
          if (isMounted) setTasks(getSampleTasks());
        }
      } finally {
        // どのルートでも最終的にローディング状態を解除
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTasks();

    return () => {
      isMounted = false;
    };
  }, [user, profile, loading, router]);  // eslint-disable-line react-hooks/exhaustive-deps

  // サンプルタスクを取得する関数
  const getSampleTasks = (): Task[] => {
    return [
      {
        id: "sample-1",
        title: "Temperature Records",
        description: "温度記録管理",
        created_at: new Date().toISOString()
      },
      {
        id: "sample-2",
        title: "Equipment Maintenance",
        description: "機器メンテナンス",
        created_at: new Date().toISOString()
      },
      {
        id: "sample-3",
        title: "Quality Control",
        description: "品質管理",
        created_at: new Date().toISOString()
      },
      {
        id: "sample-4",
        title: "Clinical reagent manager",
        description: "試薬管理",
        created_at: new Date().toISOString()
      }
    ];
  };

  const handleCardClick = (path: string) => {
    router.push(
      `${path}?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`
    );
  };

  // ローディング表示
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
        <AppHeader showBackButton={true} />
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#8167a9] mx-auto mb-4" />
          <p className="text-[#8167a9]">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full flex flex-col bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
        <AppHeader showBackButton={true} />
        
        <div className="container mx-auto px-4 py-4">
          {/* 通知エリア */}
          <div className="mb-6 p-4 border border-yellow-300 bg-yellow-50 rounded-md">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
              お知らせ
            </h3>
            <p className="text-sm text-yellow-700 text-left">
              現在、システムメンテナンスを予定しています。詳細は管理者にお問い合わせください。
            </p>
          </div>
          
          {/* カレントユーザーの氏名表示 */}
          <div className="mb-4 text-right">
            {currentUserName && (
              <p className="text-sm text-gray-600">
                {currentUserName}さんがログインしています！
              </p>
            )}
          </div>
        </div>
        
        <div className="flex-grow flex flex-col items-center justify-center py-4 px-4">
          <div className="max-w-7xl mx-auto w-full">
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

            {tasks.length === 0 ? (
              <div className="text-center py-12 bg-white/80 rounded-lg p-6">
                <p className="text-gray-600 mb-4">タスクが登録されていません</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {tasks.map((task, index) => {
                  // タイトルに基づいてアイコンとパスを選択
                  const IconComponent = iconMapping[task.title] || iconMapping.default;
                  const path = pathMapping[task.title] || pathMapping.default;
                  // インデックスに基づいて色を選択
                  const cardColor = getCardColor(index);
                  
                  return (
                    <Tooltip key={task.id}>
                      <TooltipTrigger asChild>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          onClick={() => handleCardClick(path)}
                          className="cursor-pointer"
                        >
                          <Card
                            className={`relative overflow-hidden group cursor-pointer transition-all duration-300 hover:shadow-lg ${cardColor} hover:bg-dashboard-hover`}
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
                                  <IconComponent className="w-6 h-6 text-[#8167a9] group-hover:text-pink-500 transition-colors duration-300" />
                                </div>
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-[#8167a9] mb-2 group-hover:text-pink-600 transition-colors duration-300">
                                  {task.title}
                                </h3>
                                <p className="text-sm text-[#8167a9] group-hover:text-gray-900 transition-colors duration-300">
                                  {task.description}
                                </p>
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent className={tooltipContentClass} style={tooltipStyle}>
                        <p>{task.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
