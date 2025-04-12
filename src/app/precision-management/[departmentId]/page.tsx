'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PrecisionManagementRecordForm } from '@/components/precision-management/PrecisionManagementRecordForm';
import { WeeklyRecordsSummary } from '@/components/precision-management/WeeklyRecordsSummary';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Equipment, 
  Department, 
  ImplementationTiming, 
  PrecisionManagementRecordWithDetails 
} from '@/types/precision-management';
import { format, startOfWeek as getStartOfWeek, endOfWeek as getEndOfWeek, addDays, parseISO, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw, Plus, FileCheck, ClipboardList, Calendar, LineChart, AlertTriangle, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/ui/app-header';
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// 通知の型定義
interface PrecisionManagementNotification {
  id: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: Date;
  date: string;
}

export default function DepartmentPrecisionManagementPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params?.departmentId as string;
  const [department, setDepartment] = useState<Department | null>(null);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [timings, setTimings] = useState<ImplementationTiming[]>([]);
  const [records, setRecords] = useState<PrecisionManagementRecordWithDetails[]>([]);
  const [notifications, setNotifications] = useState<PrecisionManagementNotification[]>([]);
  const [date, setDate] = useState<Date>(new Date());
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set());
  const [filteredRecords, setFilteredRecords] = useState<PrecisionManagementRecordWithDetails[]>([]);
  
  // 各データロードの状態を追跡
  const [loading, setLoading] = useState(true);
  const [hasFetchError, setHasFetchError] = useState(false);
  const [loadingDept, setLoadingDept] = useState(true);
  const [loadingEquipments, setLoadingEquipments] = useState(true);
  const [loadingTimings, setLoadingTimings] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(true);
  
  const [activeTab, setActiveTab] = useState('daily');
  const { toast } = useToast();
  const [dataVersion, setDataVersion] = useState(0); // データ更新を制御するバージョン
  const { user } = useAuth();

  // 戻るボタンのカスタム処理
  const handleBackClick = useCallback(() => {
    // 手動ナビゲーションフラグを設定
    if (typeof window !== 'undefined') {
      window.isManualNavigation = true;
    }
    
    // 部署情報をクエリパラメータとして引き継ぐ
    if (department) {
      const departmentName = encodeURIComponent(department.name);
      router.push(`/taskpick?department=${departmentName}&departmentId=${departmentId}`);
    } else {
      // 部署情報がない場合は単純に戻る
      router.push('/taskpick');
    }
  }, [router, department, departmentId]);

  // 今週の開始日と終了日を計算（メモ化して再計算を防止）
  const { startOfWeek, endOfWeek, startDateStr, endDateStr } = useMemo(() => {
    const now = new Date();
    const start = getStartOfWeek(now, { weekStartsOn: 1 }); // 月曜日始まり
    const end = getEndOfWeek(now, { weekStartsOn: 1 });
    
    return {
      startOfWeek: start,
      endOfWeek: end,
      startDateStr: format(start, 'yyyy-MM-dd'),
      endDateStr: format(end, 'yyyy-MM-dd')
    };
  }, []);

  // 部署データのみを取得
  useEffect(() => {
    async function fetchDepartmentData() {
      if (!departmentId) return;
      
      setLoadingDept(true);
      try {
        const deptResponse = await fetch(`/api/precision-management/departments`);
        
        if (!deptResponse.ok) {
          throw new Error(`部署データの取得に失敗しました: ${deptResponse.status}`);
        }
        
        const deptData = await deptResponse.json();
        
        if (Array.isArray(deptData)) {
          const currentDept = deptData.find((d: Department) => d.id === departmentId);
          setDepartment(currentDept || null);
        } else {
          console.error('部署データが配列ではありません:', deptData);
          setDepartment(null);
        }
      } catch (error) {
        console.error('部署データ取得エラー:', error);
        setHasFetchError(true);
      } finally {
        setLoadingDept(false);
      }
    }

    fetchDepartmentData();
  }, [departmentId]);

  // 機器データを取得
  useEffect(() => {
    async function fetchEquipmentData() {
      if (!departmentId) return;
      
      setLoadingEquipments(true);
      try {
        const equipResponse = await fetch(`/api/precision-management/equipments?department_id=${departmentId}`);
        
        if (!equipResponse.ok) {
          throw new Error(`機器データの取得に失敗しました: ${equipResponse.status}`);
        }
        
        const equipData = await equipResponse.json();
        
        if (Array.isArray(equipData)) {
          setEquipments(equipData);
        } else {
          console.error('機器データが配列ではありません:', equipData);
          setEquipments([]);
        }
      } catch (error) {
        console.error('機器データ取得エラー:', error);
        setEquipments([]);
      } finally {
        setLoadingEquipments(false);
      }
    }

    fetchEquipmentData();
  }, [departmentId]);

  // タイミングデータを取得
  useEffect(() => {
    async function fetchTimingData() {
      setLoadingTimings(true);
      try {
        const timingsResponse = await fetch(`/api/precision-management/timings`);
        
        if (!timingsResponse.ok) {
          throw new Error(`タイミングデータの取得に失敗しました: ${timingsResponse.status}`);
        }
        
        const timingsData = await timingsResponse.json();
        
        if (Array.isArray(timingsData)) {
          setTimings(timingsData);
        } else {
          console.error('タイミングデータが配列ではありません:', timingsData);
          setTimings([]);
        }
      } catch (error) {
        console.error('タイミングデータ取得エラー:', error);
        setTimings([]);
      } finally {
        setLoadingTimings(false);
      }
    }

    fetchTimingData();
  }, []);

  // 記録データを取得する関数（メモ化）
  const fetchRecordData = useCallback(async () => {
    if (!departmentId) return;
    
    try {
      console.log('記録データ取得開始 - バージョン:', dataVersion);
      setLoadingRecords(true);
      
      // 日付文字列はuseMemoから取得した固定値を使用
      const recordsResponse = await fetch(
        `/api/precision-management?department_id=${departmentId}&start_date=${startDateStr}&end_date=${endDateStr}`
      );
      
      if (!recordsResponse.ok) {
        throw new Error(`記録データの取得に失敗しました: ${recordsResponse.status}`);
      }
      
      const recordsData = await recordsResponse.json();
      
      if (Array.isArray(recordsData)) {
        setRecords(recordsData);
        console.log('記録データ取得成功:', recordsData.length, '件');

        // 未記録の通知を作成
        createMissingRecordsNotifications(recordsData);

        // データがある日付を設定
        const dates = new Set<string>();
        recordsData.forEach(record => {
          const dateStr = record.implementation_date.split('T')[0];
          dates.add(dateStr);
        });
        setDatesWithData(dates);

        // 選択された日付のレコードをフィルタリング
        filterRecordsByDate(recordsData, date);
      } else {
        console.error('記録データが配列ではありません:', recordsData);
        setRecords([]);
      }
    } catch (error) {
      console.error('記録データ取得エラー:', error);
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [departmentId, startDateStr, endDateStr, dataVersion, date]);

  // 選択された日付に基づいてレコードをフィルタリングする関数
  const filterRecordsByDate = useCallback((allRecords: PrecisionManagementRecordWithDetails[], selectedDate: Date) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const filtered = allRecords.filter(record => {
      const recordDate = record.implementation_date.split('T')[0];
      return recordDate === dateStr;
    });
    setFilteredRecords(filtered);
  }, []);

  // 日付に基づいて記録を取得する関数
  const getRecordsForDate = useCallback((allRecords: PrecisionManagementRecordWithDetails[], dateObj: Date) => {
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    return allRecords.filter(record => {
      const recordDate = record.implementation_date.split('T')[0];
      return recordDate === dateStr;
    });
  }, []);

  // 選択された日付の前日と前々日の日付を計算
  const getPreviousDays = useMemo(() => {
    const selectedDate = new Date(date);
    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dayBeforeYesterday = new Date(selectedDate);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
    
    return {
      selectedDate,
      yesterday,
      dayBeforeYesterday
    };
  }, [date]);

  // 日付が変更されたときにレコードをフィルタリング
  useEffect(() => {
    filterRecordsByDate(records, date);
  }, [date, records, filterRecordsByDate]);

  // 未記録の通知を作成
  const createMissingRecordsNotifications = useCallback((recordsData: PrecisionManagementRecordWithDetails[]) => {
    if (!equipments.length || !timings.length) return;

    console.log('通知生成開始 - 精度管理記録通知を作成します');
    const notifications: PrecisionManagementNotification[] = [];
    
    // 当日の日付を取得
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
    
    // 今週の日付の配列を生成
    const datesInRange: Date[] = [];
    const startDate = new Date(startOfWeek);
    const endDate = new Date(endOfWeek);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      datesInRange.push(new Date(d));
    }
    
    // 各機器について処理
    equipments.forEach(equipment => {
      // 今日の記録があるかチェック
      const hasTodayRecord = recordsData.some(record => 
        record.pm_equipment_id === equipment.pm_equipment_id && 
        record.implementation_date.startsWith(today)
      );
      
      // 今日の記録がない場合は通知を作成
      if (!hasTodayRecord) {
        notifications.push({
          id: `${equipment.pm_equipment_id}-${today}`,
          message: `${format(new Date(), 'MM/dd')}の${equipment.equipment_name}の精度管理記録が未入力です`,
          priority: 'high',
          timestamp: new Date(),
          date: today
        });
        
        console.log('通知作成: 今日の記録なし -', equipment.equipment_name);
      }
      
      // 昨日の記録があるかチェック（優先度は下げる）
      const hasYesterdayRecord = recordsData.some(record => 
        record.pm_equipment_id === equipment.pm_equipment_id && 
        record.implementation_date.startsWith(yesterday)
      );
      
      // 昨日の記録がない場合は通知を作成
      if (!hasYesterdayRecord) {
        notifications.push({
          id: `${equipment.pm_equipment_id}-${yesterday}`,
          message: `${format(new Date(Date.now() - 86400000), 'MM/dd')}の${equipment.equipment_name}の精度管理記録が未入力です`,
          priority: 'medium',
          timestamp: new Date(),
          date: yesterday
        });
        
        console.log('通知作成: 昨日の記録なし -', equipment.equipment_name);
      }
      
      // 今週の残りの日について記録があるかチェック（過去の日のみ）
      datesInRange.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        // 今日と昨日はすでに処理済みなのでスキップ
        if (dateStr === today || dateStr === yesterday) return;
        
        // 過去の日付のみチェック
        const isDateInPast = new Date(dateStr) < new Date(today);
        if (!isDateInPast) return;
        
        const hasRecord = recordsData.some(record => 
          record.pm_equipment_id === equipment.pm_equipment_id && 
          record.implementation_date.startsWith(dateStr)
        );
        
        // 記録がない場合は通知を作成（優先度は低め）
        if (!hasRecord) {
          notifications.push({
            id: `${equipment.pm_equipment_id}-${dateStr}`,
            message: `${format(new Date(dateStr), 'MM/dd')}の${equipment.equipment_name}の精度管理記録が未入力です`,
            priority: 'low',
            timestamp: new Date(),
            date: dateStr
          });
        }
      });
    });

    // 日付の新しい順に並べ替え
    notifications.sort((a, b) => {
      // まず優先度でソート
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      if (priorityDiff !== 0) return priorityDiff;
      
      // 優先度が同じ場合は日付でソート（新しい順）
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });
    
    // 通知数を最大20件に制限
    const limitedNotifications = notifications.slice(0, 20);

    console.log('生成された通知数:', notifications.length);
    console.log('表示される通知数:', limitedNotifications.length);
    setNotifications(limitedNotifications);
  }, [equipments, startOfWeek, endOfWeek]);

  // 記録データを取得
  useEffect(() => {
    fetchRecordData();
  }, [fetchRecordData]);

  // すべてのデータロードが完了したかどうかを確認
  useEffect(() => {
    if (!loadingDept && !loadingEquipments && !loadingTimings && !loadingRecords) {
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [loadingDept, loadingEquipments, loadingTimings, loadingRecords]);

  // 記録追加後のデータ更新
  const refreshRecords = () => {
    // データバージョンを更新するだけで、useEffectのトリガーになる
    setDataVersion(prev => prev + 1);
  };

  // 全てのデータを再取得
  const handleRefreshAll = () => {
    setLoading(true);
    setHasFetchError(false);
    setLoadingDept(true);
    setLoadingEquipments(true);
    setLoadingTimings(true);
    setLoadingRecords(true);
    setDataVersion(prev => prev + 1);
  };

  // カレンダーの日付にデータがあるかどうか表示するコンポーネント
  const CustomDayContent = ({ date, ...props }: any) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const localDateStr = `${year}-${month}-${day}`;
    const hasData = datesWithData.has(localDateStr);
    
    return (
      <div className="relative flex items-center justify-center w-full h-full">
        {hasData ? (
          <div 
            className="absolute w-12 h-12 bg-purple-400/40 rounded-full"
            style={{ filter: "blur(8px)" }}
          />
        ) : null}
        <span className={`relative z-10 text-base ${hasData ? "font-semibold" : "font-medium"}`}>{date.getDate()}</span>
      </div>
    );
  };

  // フォーマット関数
  const formatDateForDisplay = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, 'yyyy年MM月dd日 HH:mm', { locale: ja });
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">読み込み中...</div>;
  }

  if (hasFetchError) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>データ取得エラー</AlertTitle>
          <AlertDescription>
            データの取得中にエラーが発生しました。
          </AlertDescription>
        </Alert>
        <Button onClick={handleRefreshAll} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          再読み込み
        </Button>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>部署が見つかりません</AlertTitle>
          <AlertDescription>
            指定された部署ID ({departmentId}) に該当する部署が見つかりませんでした。
          </AlertDescription>
        </Alert>
        <Button onClick={handleRefreshAll} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          再読み込み
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader 
        title="Quality Control Management" 
        showBackButton={true}
        onBackClick={handleBackClick}
        icon={<LineChart className="h-6 w-6 text-amber-400" />}
      />

      <div className="max-w-6xl mx-auto p-4">
        {/* ヘッダーセクション - 3カラムレイアウト */}
        <div className="mb-6 grid grid-cols-3 items-center">
          {/* 左カラム - サブタイトル */}
          <div className="text-left">
            <h2 className="text-xl font-bold text-primary">Quality Control Management Dashboard</h2>
          </div>
          
          {/* 中央カラム - 部署名 */}
          <div className="text-center">
            <h1 className="text-2xl font-bold">『{department.name}』</h1>
          </div>
          
          {/* 右カラム - 施設情報とユーザー情報 */}
          <div className="text-right">
            <p className="text-gray-700 text-sm">
              施設「独立行政法人国立病院機構　都城医療センター」
            </p>
            <p className="text-gray-600 text-sm">
              {user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}さんがログインしています
            </p>
          </div>
        </div>

        {/* 週間期間表示 - 小さいテキストで表示 */}
        <div className="mb-6 text-right">
          <p className="text-xs text-gray-500">
            週間期間: {format(startOfWeek, 'yyyy年MM月dd日(EE)', { locale: ja })} 〜 
            {format(endOfWeek, 'yyyy年MM月dd日(EE)', { locale: ja })}
          </p>
        </div>

        {/* 通知表示 */}
        <div className="w-full mb-6">
          <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
              <AlertTriangle className="inline-block mr-2 h-5 w-5" />
              精度管理通知 ({notifications.length}件)
            </h3>
            <div className="max-h-40 overflow-y-auto">
              {notifications.length > 0 ? (
                <ul className="list-disc pl-5 text-left">
                  {notifications.map((notification) => (
                    <li 
                      key={notification.id} 
                      className={`text-sm mb-1 ${
                        notification.priority === "high" 
                          ? "text-red-700" 
                          : "text-yellow-700"
                      }`}
                    >
                      {notification.message}
                      <span className="text-xs text-muted-foreground ml-2">
                        {notification.timestamp ? formatDateForDisplay(notification.timestamp.toISOString()) : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-center py-2">通知はありません</p>
              )}
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-3 mb-6">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => setActiveTab('daily')}
              className="bg-gradient-to-r from-blue-300 to-indigo-400 hover:from-blue-400 hover:to-indigo-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Plus className="h-5 w-5 mr-2 text-blue-100" />
              新規精度管理記録
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => setActiveTab('weekly')}
              className="bg-gradient-to-r from-indigo-300 to-purple-400 hover:from-indigo-400 hover:to-purple-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <FileCheck className="h-5 w-5 mr-2 text-indigo-100" />
              週次精度管理確認
            </Button>
          </motion.div>
        </div>

        {/* カレンダー */}
        <div className="bg-white p-4 rounded-lg border border-border text-black mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-gray-500" />
            日付選択
          </h2>
          <CalendarComponent
            mode="single"
            selected={date}
            onSelect={(newDate) => newDate && setDate(newDate)}
            className="rounded-md border w-full max-w-none"
            components={{ DayContent: CustomDayContent }}
          />
        </div>

        {/* 記録一覧（アコーディオン形式） */}
        <div className="bg-white rounded-lg border border-border overflow-hidden mb-6">
          <Accordion type="single" collapsible defaultValue="" className="w-full">
            {/* 選択された日付の記録 */}
            {(() => {
              const selectedDayRecords = getRecordsForDate(records, getPreviousDays.selectedDate);
              const formattedDate = format(getPreviousDays.selectedDate, 'yyyy年MM月dd日(EE)', { locale: ja });
              const isCurrentDay = isToday(getPreviousDays.selectedDate);
              
              return (
                <AccordionItem value="selected-day">
                  <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center">
                        <ClipboardList className="h-5 w-5 mr-2 text-gray-500" />
                        <span className="font-semibold">{formattedDate}{isCurrentDay ? " (今日)" : ""}</span>
                      </div>
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {selectedDayRecords.length}件の記録
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {loadingRecords ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                        <p className="mt-4 text-gray-500">データを読み込み中...</p>
                      </div>
                    ) : selectedDayRecords.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <p>この日付の記録はありません</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>機器名</TableHead>
                              <TableHead>タイミング</TableHead>
                              <TableHead>日時</TableHead>
                              <TableHead>実施者</TableHead>
                              <TableHead>サンプル数/エラー</TableHead>
                              <TableHead>シフト/トレンド</TableHead>
                              <TableHead>備考</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedDayRecords.map((record) => (
                              <TableRow key={record.record_id}>
                                <TableCell className="font-medium">{record.equipment_name}</TableCell>
                                <TableCell>{record.timing_name}</TableCell>
                                <TableCell>
                                  {record.implementation_time || '00:00'}
                                </TableCell>
                                <TableCell>{record.implementer}</TableCell>
                                <TableCell className="text-center">{record.implementation_count} / {record.error_count}</TableCell>
                                <TableCell className="text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs ${record.shift_trend ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {record.shift_trend ? 'あり' : 'なし'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm">{record.remarks || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })()}

            {/* 前日の記録 */}
            {(() => {
              const yesterdayRecords = getRecordsForDate(records, getPreviousDays.yesterday);
              const formattedDate = format(getPreviousDays.yesterday, 'yyyy年MM月dd日(EE)', { locale: ja });
              
              return (
                <AccordionItem value="yesterday">
                  <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center">
                        <ClipboardList className="h-5 w-5 mr-2 text-gray-500" />
                        <span className="font-semibold">{formattedDate} (前日)</span>
                      </div>
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {yesterdayRecords.length}件の記録
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {loadingRecords ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                        <p className="mt-4 text-gray-500">データを読み込み中...</p>
                      </div>
                    ) : yesterdayRecords.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <p>この日付の記録はありません</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>機器名</TableHead>
                              <TableHead>タイミング</TableHead>
                              <TableHead>日時</TableHead>
                              <TableHead>実施者</TableHead>
                              <TableHead>サンプル数/エラー</TableHead>
                              <TableHead>シフト/トレンド</TableHead>
                              <TableHead>備考</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {yesterdayRecords.map((record) => (
                              <TableRow key={record.record_id}>
                                <TableCell className="font-medium">{record.equipment_name}</TableCell>
                                <TableCell>{record.timing_name}</TableCell>
                                <TableCell>
                                  {record.implementation_time || '00:00'}
                                </TableCell>
                                <TableCell>{record.implementer}</TableCell>
                                <TableCell className="text-center">{record.implementation_count} / {record.error_count}</TableCell>
                                <TableCell className="text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs ${record.shift_trend ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {record.shift_trend ? 'あり' : 'なし'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm">{record.remarks || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })()}

            {/* 前々日の記録 */}
            {(() => {
              const dayBeforeYesterdayRecords = getRecordsForDate(records, getPreviousDays.dayBeforeYesterday);
              const formattedDate = format(getPreviousDays.dayBeforeYesterday, 'yyyy年MM月dd日(EE)', { locale: ja });
              
              return (
                <AccordionItem value="day-before-yesterday">
                  <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center">
                        <ClipboardList className="h-5 w-5 mr-2 text-gray-500" />
                        <span className="font-semibold">{formattedDate} (前々日)</span>
                      </div>
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {dayBeforeYesterdayRecords.length}件の記録
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {loadingRecords ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                        <p className="mt-4 text-gray-500">データを読み込み中...</p>
                      </div>
                    ) : dayBeforeYesterdayRecords.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <p>この日付の記録はありません</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>機器名</TableHead>
                              <TableHead>タイミング</TableHead>
                              <TableHead>日時</TableHead>
                              <TableHead>実施者</TableHead>
                              <TableHead>サンプル数/エラー</TableHead>
                              <TableHead>シフト/トレンド</TableHead>
                              <TableHead>備考</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dayBeforeYesterdayRecords.map((record) => (
                              <TableRow key={record.record_id}>
                                <TableCell className="font-medium">{record.equipment_name}</TableCell>
                                <TableCell>{record.timing_name}</TableCell>
                                <TableCell>
                                  {record.implementation_time || '00:00'}
                                </TableCell>
                                <TableCell>{record.implementer}</TableCell>
                                <TableCell className="text-center">{record.implementation_count} / {record.error_count}</TableCell>
                                <TableCell className="text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs ${record.shift_trend ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {record.shift_trend ? 'あり' : 'なし'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm">{record.remarks || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })()}
          </Accordion>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">日次記録</TabsTrigger>
            <TabsTrigger value="weekly">週間サマリー</TabsTrigger>
          </TabsList>
          
          <TabsContent value="daily">
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
              <h2 className="text-xl font-semibold mb-4">精度管理記録入力</h2>
              <PrecisionManagementRecordForm 
                departmentId={departmentId}
                equipments={equipments}
                timings={timings}
                onRecordAdded={refreshRecords}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="weekly">
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
              <h2 className="text-xl font-semibold mb-4">週間記録サマリー</h2>
              <WeeklyRecordsSummary 
                departmentId={departmentId}
                equipments={equipments}
                records={records}
                startDate={startOfWeek}
                endDate={endOfWeek}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 