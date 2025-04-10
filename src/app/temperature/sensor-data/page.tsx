'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Home, Bell, Activity, Calendar, Download, Filter, RefreshCw, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { ja } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useSimpleAuth } from '@/hooks/useSimpleAuth';
import { useSessionCheck } from '@/hooks/useSessionCheck';

// Chart.jsの設定
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// センサーログのインターフェース
interface SensorLog {
  id: string;
  raw_data: {
    ahtTemp: number | null;
    bmpTemp: number | null;
    ahtHum: number | null;
    bmpPres: number | null;
    batteryVolt: number | null;
  };
  recorded_at: string;
}

// センサーデバイスのインターフェース
interface SensorDevice {
  id: string;
  device_id?: string;
  device_name: string;
  ip_address: string;
  location: string | null;
}

// ファイルの先頭に部門インターフェースを追加
interface Department {
  id: string;
  name: string;
}

// メインページコンポーネント - Suspenseを使用して内部コンポーネントをラップする
export default function SensorDataPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">データを読み込み中...</p>
        </div>
      </div>
    }>
      <SensorDataContent />
    </Suspense>
  );
}

// 実際のコンテンツコンポーネント
function SensorDataContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentNameFromUrl = searchParams?.get("department") || "";
  const departmentIdFromUrl = searchParams?.get("departmentId") || "";
  const deviceId = searchParams?.get("deviceId") || ""; // URLからデバイスIDを取得
  
  // セッション確認を無効化
  useSessionCheck(false, []);
  
  // シンプルな認証を使用
  const { user, loading: authLoading } = useSimpleAuth();
  
  // ユーザーがログインしていない場合はログインページにリダイレクト
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const [sensorLogs, setSensorLogs] = useState<SensorLog[]>([]);
  const [sensorDevice, setSensorDevice] = useState<SensorDevice | null>(null);
  const [availableDevices, setAvailableDevices] = useState<SensorDevice[]>([]); // 利用可能なデバイスのリスト
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>(() => {
    // デフォルトで7日前
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    // デフォルトで今日
    return new Date().toISOString().split('T')[0];
  });
  const [facilityName, setFacilityName] = useState<string>("");
  const [facilityId, setFacilityId] = useState<string>("");
  const [departments, setDepartments] = useState<Department[]>([]); // 施設の部門一覧
  const [userDepartmentId, setUserDepartmentId] = useState<string>(""); // ユーザーの所属部門ID
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(departmentIdFromUrl || ""); // 選択された部門ID
  const [departmentName, setDepartmentName] = useState<string>(departmentNameFromUrl || ""); // 選択された部門名
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(deviceId || ""); // 選択されたデバイスID
  const [dateRange, setDateRange] = useState<string>("1W"); // 日付範囲の選択（1W, 2W, 1M, custom）
  
  // ページング用の状態変数
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10); // 1ページあたりの表示件数
  const [totalItems, setTotalItems] = useState<number>(0);

  // ページネーションのための計算されたデータ
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sensorLogs.slice(startIndex, endIndex);
  }, [sensorLogs, currentPage, itemsPerPage]);
  
  // ページ変更ハンドラ
  const handlePageChange = (page: number) => {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setCurrentPage(page);
  };

  // 日付範囲選択に基づいて開始日と終了日を設定する関数
  const updateDateRange = (range: string) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startDate = new Date();
    
    switch(range) {
      case "1W": // 1週間
        startDate.setDate(now.getDate() - 7);
        break;
      case "2W": // 2週間
        startDate.setDate(now.getDate() - 14);
        break;
      case "1M": // 1ヶ月
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "custom": // カスタム（現在の日付は変更しない）
        return; // カスタムの場合は日付を自動変更しない
      default:
        startDate.setDate(now.getDate() - 7); // デフォルトは1週間
    }
    
    setStartDate(startDate.toISOString().split('T')[0]);
    setEndDate(today);
  };

  // 日付範囲が変更されたとき
  useEffect(() => {
    if (dateRange !== "custom") {
      updateDateRange(dateRange);
    }
  }, [dateRange]);

  // 施設情報と部門情報の取得
  useEffect(() => {
    const fetchFacilityAndDepartmentInfo = async () => {
      try {
        console.log('施設・部門情報を取得中...');
        console.log('URLパラメータ:', { departmentNameFromUrl, departmentIdFromUrl });
        
        // ユーザー情報の取得
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('認証ユーザー情報の取得に失敗しました');
          return;
        }
        
        // ユーザープロファイルからfacility_idとdepartment_idを取得
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*') // 詳細なデバッグのために全フィールドを取得
          .eq('id', user.id)
          .single();
          
        if (profileError) {
          console.error('ユーザー情報取得エラー:', profileError);
          return;
        }

        console.log('取得したユーザー情報:', profileData);
        
        // URLから渡されたdepartmentIdがある場合はそれを優先して使用
        if (departmentIdFromUrl) {
          console.log(`URLから部門ID ${departmentIdFromUrl} を使用します`);
          setSelectedDepartmentId(departmentIdFromUrl);
          
          // 部門名を取得
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('name')
            .eq('id', departmentIdFromUrl)
            .single();
            
          if (deptError) {
            console.error('部門情報取得エラー:', deptError);
          } else if (deptData) {
            console.log(`部門名を取得しました: ${deptData.name}`);
            setDepartmentName(deptData.name);
          }
        } 
        // URLからの部門IDがない場合はユーザーの所属部門を使用
        else if (profileData?.department_id) {
          setUserDepartmentId(profileData.department_id);
          setSelectedDepartmentId(profileData.department_id);
          
          // 部門名を取得
          const { data: userDeptData, error: deptError } = await supabase
            .from('departments')
            .select('name')
            .eq('id', profileData.department_id)
            .single();
            
          if (!deptError && userDeptData) {
            setDepartmentName(userDeptData.name);
          }
        } else {
          console.warn('ユーザーに部門IDが設定されていません');
        }

        if (profileData?.facility_id) {
          console.log(`施設ID ${profileData.facility_id} の詳細を取得中...`);
          
          // 施設情報を取得
          const { data: facilityData, error: facilityError } = await supabase
            .from('facilities')
            .select('id, name')
            .eq('id', profileData.facility_id)
            .single();

          if (facilityError) {
            console.error('施設情報取得エラー:', facilityError);
            return;
          }

          console.log('取得した施設情報:', facilityData);
          setFacilityId(facilityData.id);
          setFacilityName(facilityData.name);
          
          // キャッシュに保存
          try {
            localStorage.setItem('facilityCache', JSON.stringify({
              id: facilityData.id,
              name: facilityData.name
            }));
            console.log('施設情報をキャッシュに保存しました');
          } catch (e) {
            console.error('施設情報のキャッシュに失敗:', e);
          }
        } else {
          console.warn('ユーザーに施設IDが設定されていません');
        }
      } catch (error) {
        console.error('施設情報の取得に失敗:', error);
      }
    };

    fetchFacilityAndDepartmentInfo();
  }, [departmentIdFromUrl, departmentNameFromUrl, router]);

  // センサーデータとデバイス情報の取得
  useEffect(() => {
    if (!facilityId || !selectedDepartmentId) {
      console.log('施設IDまたは部門IDが不足しています');
      return;
    }

    // 部門に属する利用可能なセンサーデバイスを取得
    const fetchAvailableDevices = async () => {
      try {
        console.log(`部門ID ${selectedDepartmentId} のセンサーデバイスを検索中...`);
        
        // 指定された部門と施設に一致するセンサーデバイスを取得
        const { data, error } = await supabase
          .from('sensor_devices')
          .select('id, device_id, device_name, ip_address, location')
          .eq('facility_id', facilityId)
          .eq('department_id', selectedDepartmentId);
        
        if (error) {
          console.error('センサーデバイス取得エラー:', error);
          return;
        }

        if (data && data.length > 0) {
          console.log(`${data.length}件のセンサーデバイスが見つかりました:`, data);
          setAvailableDevices(data);
          
          // デバイスIDが指定されていない場合は最初のデバイスを選択
          if (!selectedDeviceId && data.length > 0) {
            console.log('最初のデバイスを自動選択します:', data[0]);
            setSelectedDeviceId(data[0].id);
            setSensorDevice(data[0]);
          } else if (selectedDeviceId) {
            // 指定されたデバイスIDを持つデバイスを探す
            const device = data.find(d => d.id === selectedDeviceId);
            if (device) {
              setSensorDevice(device);
            } else if (data.length > 0) {
              // 指定されたデバイスIDが見つからない場合は最初のデバイスを選択
              setSelectedDeviceId(data[0].id);
              setSensorDevice(data[0]);
            }
          }
        } else {
          console.log('センサーデバイスが見つかりませんでした');
          // センサーデバイスが見つからない場合は状態をクリア
          setAvailableDevices([]);
          setSensorDevice(null);
          setSelectedDeviceId('');
          setSensorLogs([]);
        }
      } catch (error) {
        console.error('デバイス検索エラー:', error);
      }
    };

    fetchAvailableDevices();
  }, [facilityId, selectedDepartmentId]);

  // 選択されたデバイスのセンサーログを取得
  useEffect(() => {
    if (!selectedDeviceId) {
      console.log('デバイスIDが選択されていません');
      setSensorLogs([]);
      setLoading(false);
      return;
    }

    const fetchSensorLogs = async () => {
      console.log(`デバイスID ${selectedDeviceId} のログを検索中...`);
      setLoading(true);
      try {
        const { data: logData, error: logError } = await supabase
          .from('sensor_logs')
          .select('id, raw_data, recorded_at')
          .eq('sensor_device_id', selectedDeviceId)
          .gte('recorded_at', `${startDate}T00:00:00`)
          .lte('recorded_at', `${endDate}T23:59:59`)
          .order('recorded_at', { ascending: false }); // 降順に変更

        if (logError) {
          console.error('センサーログ取得エラー:', logError);
          setSensorLogs([]);
          setTotalItems(0);
        } else if (logData && logData.length > 0) {
          console.log(`センサーログを ${logData.length} 件発見しました`);
          setSensorLogs(logData);
          setTotalItems(logData.length);
          setCurrentPage(1); // 新しいデータを取得したら1ページ目に戻る
        } else {
          console.log('センサーログが見つかりませんでした。検索期間を確認してください。');
          setSensorLogs([]);
          setTotalItems(0);
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
        setSensorLogs([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    };

    fetchSensorLogs();
  }, [selectedDeviceId, startDate, endDate]);

  // データ更新
  const refreshData = () => {
    if (!selectedDeviceId) {
      console.log('更新に必要なデバイスIDが不足しています');
      return;
    }
    
    const fetchUpdatedData = async () => {
      console.log('データを更新しています...');
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('sensor_logs')
          .select('id, raw_data, recorded_at')
          .eq('sensor_device_id', selectedDeviceId)
          .gte('recorded_at', `${startDate}T00:00:00`)
          .lte('recorded_at', `${endDate}T23:59:59`)
          .order('recorded_at', { ascending: false }); // 降順に変更

        if (error) {
          console.error('センサーログ更新エラー:', error);
          setSensorLogs([]);
          setTotalItems(0);
        } else if (data && data.length > 0) {
          console.log(`センサーログを ${data.length} 件更新しました`);
          setSensorLogs(data);
          setTotalItems(data.length);
          setCurrentPage(1); // 更新したら1ページ目に戻る
        } else {
          console.log('更新されたセンサーログはありません');
          setSensorLogs([]);
          setTotalItems(0);
        }
      } catch (error) {
        console.error('データ更新エラー:', error);
        setSensorLogs([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    };

    fetchUpdatedData();
  };

  // CSVダウンロード
  const downloadCSV = () => {
    if (!sensorLogs.length) return;

    let csvContent = "日時,AHT20温度(℃),BMP280温度(℃),AHT20湿度(%),BMP280気圧(hPa),バッテリー電圧(V),バッテリー残量(%)\n";
    
    sensorLogs.forEach(log => {
      const date = new Date(log.recorded_at).toLocaleString();
      const ahtTemp = log.raw_data?.ahtTemp !== null ? log.raw_data.ahtTemp.toFixed(1) : "";
      const bmpTemp = log.raw_data?.bmpTemp !== null ? log.raw_data.bmpTemp.toFixed(1) : "";
      const ahtHum = log.raw_data?.ahtHum !== null ? log.raw_data.ahtHum.toFixed(1) : "";
      const bmpPres = log.raw_data?.bmpPres !== null ? log.raw_data.bmpPres.toFixed(1) : "";
      const batteryVolt = log.raw_data?.batteryVolt !== null ? log.raw_data.batteryVolt.toFixed(3) : "";
      
      // バッテリー残量を計算（3.000V=0%, 3.300V=100%）
      let batteryPercentage = "";
      if (log.raw_data?.batteryVolt !== null && log.raw_data?.batteryVolt !== undefined) {
        const minVoltage = 3.000;
        const maxVoltage = 3.300;
        const percentage = ((log.raw_data.batteryVolt - minVoltage) / (maxVoltage - minVoltage)) * 100;
        batteryPercentage = Math.max(0, Math.min(100, percentage)).toFixed(0);
      }
      
      csvContent += `${date},${ahtTemp},${bmpTemp},${ahtHum},${bmpPres},${batteryVolt},${batteryPercentage}\n`;
    });

    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sensor_data_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // グラフデータの作成
  const chartData = useMemo(() => {
    if (!sensorLogs.length) return null;

    // グラフ表示のためにデータを日付昇順（古い順）にソート
    const sortedLogs = [...sensorLogs].sort((a, b) => 
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );

    const labels = sortedLogs.map(log => new Date(log.recorded_at));
    
    // センサー値の抽出
    const ahtTempData = sortedLogs.map(log => log.raw_data?.ahtTemp ?? null);
    const bmpTempData = sortedLogs.map(log => log.raw_data?.bmpTemp ?? null);
    const ahtHumData = sortedLogs.map(log => log.raw_data?.ahtHum ?? null);
    const bmpPresData = sortedLogs.map(log => log.raw_data?.bmpPres ?? null);
    const batteryVoltData = sortedLogs.map(log => log.raw_data?.batteryVolt ?? null);

    return {
      labels,
      datasets: [
        {
          label: 'AHT20温度 (℃)',
          data: ahtTempData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          tension: 0.1,
          pointRadius: 2,
          yAxisID: 'y1',
        },
        {
          label: 'BMP280温度 (℃)',
          data: bmpTempData,
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.5)',
          tension: 0.1,
          pointRadius: 2,
          yAxisID: 'y1',
        },
        {
          label: 'AHT20湿度 (%)',
          data: ahtHumData,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          tension: 0.1,
          pointRadius: 2,
          yAxisID: 'y2',
        },
        {
          label: 'BMP280気圧 (hPa)',
          data: bmpPresData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          tension: 0.1,
          pointRadius: 2,
          yAxisID: 'y3',
        },
        {
          label: 'バッテリー電圧 (V)',
          data: batteryVoltData,
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.5)',
          tension: 0.1,
          pointRadius: 2,
          yAxisID: 'y4',
        }
      ]
    };
  }, [sensorLogs]);

  // グラフオプション
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'センサーデータ',
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          tooltipFormat: 'yyyy/MM/dd HH:mm',
          displayFormats: {
            day: 'MM/dd'
          }
        },
        adapters: {
          date: {
            locale: ja
          }
        },
        title: {
          display: true,
          text: '日付'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: '温度 (℃)'
        }
      },
      y2: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: '湿度 (%)'
        },
        grid: {
          drawOnChartArea: false
        }
      },
      y3: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: '気圧 (hPa)'
        },
        grid: {
          drawOnChartArea: false
        }
      },
      y4: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        min: 3.000,  // バッテリー電圧の最小値を3.000Vに修正
        max: 3.300,  // バッテリー電圧の最大値を3.300Vに修正
        title: {
          display: true,
          text: '電圧 (V)'
        },
        grid: {
          drawOnChartArea: false
        }
      }
    }
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-background">
      {/* ヘッダー */}
      <header className="border-b border-border bg-white">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-4">
            <Activity className="h-6 w-6 text-[rgb(155,135,245)]" />
            <h1 className="text-xl font-semibold">センサーデータ履歴</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/depart")}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Home className="h-5 w-5 text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Bell className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      {/* 部署名表示 */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          {facilityName && (
            <h2 className="cutefont text-lg font-medium text-foreground">
              施設: {facilityName}
            </h2>
          )}
          {facilityName && departmentName && (
            <span className="hidden sm:inline text-gray-400">-</span>
          )}
          <h2 className="cutefont text-lg font-medium text-foreground">
            部署: {departmentName}
          </h2>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* フィルター部分 */}
        <div className="bg-white p-4 rounded-lg border border-border shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            {/* 期間選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">期間</label>
              <div className="flex border border-gray-300 rounded-md overflow-hidden">
                <button
                  onClick={() => setDateRange("1W")}
                  className={`px-3 py-2 text-sm ${dateRange === "1W" 
                    ? "bg-blue-500 text-white" 
                    : "bg-white text-gray-700 hover:bg-gray-100"}`}
                >
                  1週間
                </button>
                <button
                  onClick={() => setDateRange("2W")}
                  className={`px-3 py-2 text-sm ${dateRange === "2W" 
                    ? "bg-blue-500 text-white" 
                    : "bg-white text-gray-700 hover:bg-gray-100"}`}
                >
                  2週間
                </button>
                <button
                  onClick={() => setDateRange("1M")}
                  className={`px-3 py-2 text-sm ${dateRange === "1M" 
                    ? "bg-blue-500 text-white" 
                    : "bg-white text-gray-700 hover:bg-gray-100"}`}
                >
                  1ヶ月
                </button>
                <button
                  onClick={() => setDateRange("custom")}
                  className={`px-3 py-2 text-sm ${dateRange === "custom" 
                    ? "bg-blue-500 text-white" 
                    : "bg-white text-gray-700 hover:bg-gray-100"}`}
                >
                  指定日
                </button>
              </div>
            </div>
            
            {/* カスタム日付選択（カスタム選択時のみ表示） */}
            {dateRange === "custom" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
            
            {/* 部門情報表示 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">所属部門</label>
              <div className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50 min-w-[160px]">
                {departmentName || "未設定"}
              </div>
            </div>
            
            {/* デバイス選択ドロップダウン */}
            {selectedDepartmentId ? (
              availableDevices.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">デバイス選択</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
                  >
                    <option value="">デバイスを選択...</option>
                    {availableDevices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.device_name} {device.location ? `(${device.location})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center text-amber-600 text-sm">
                  <span className="px-3 py-2">所属部門にはセンサーデバイスが登録されていません</span>
                </div>
              )
            ) : (
              <div className="flex items-center text-red-600 text-sm">
                <span className="px-3 py-2">部門が設定されていません。プロフィール設定を確認してください。</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={refreshData}
                className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition"
              >
                <RefreshCw className="h-4 w-4" />
                <span>更新</span>
              </button>
            </div>
          </div>
        </div>

        {/* センサー情報 */}
        {sensorDevice && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-100">
            <h3 className="text-sm font-medium mb-2 text-purple-800">センサーデバイス情報</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-gray-500 block">デバイスID</span>
                <span className="font-medium">{sensorDevice.device_id || sensorDevice.id}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">デバイス名</span>
                <span className="font-medium">{sensorDevice.device_name}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">IPアドレス</span>
                <span className="font-medium">{sensorDevice.ip_address}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">設置場所</span>
                <span className="font-medium">{sensorDevice.location || '未設定'}</span>
              </div>
            </div>
          </div>
        )}

        {/* データグラフ */}
        <div className="bg-white p-4 rounded-lg border border-border shadow-sm">
          <h3 className="text-lg font-medium mb-4">センサーデータグラフ</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : !selectedDepartmentId ? (
            <div className="h-80 flex flex-col items-center justify-center text-red-600">
              <Filter className="h-16 w-16 text-red-300 mb-2" />
              <p>部門が設定されていません。プロフィール設定を確認してください。</p>
            </div>
          ) : !selectedDeviceId ? (
            <div className="h-80 flex flex-col items-center justify-center text-amber-600">
              <Filter className="h-16 w-16 text-amber-300 mb-2" />
              <p>表示するセンサーデバイスを選択してください</p>
            </div>
          ) : sensorLogs.length === 0 ? (
            <div className="h-80 flex flex-col items-center justify-center text-gray-500">
              <Calendar className="h-16 w-16 text-gray-300 mb-2" />
              <p>選択した期間にデータがありません</p>
            </div>
          ) : chartData ? (
            <div className="h-80">
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : null}
        </div>
        
        {/* ボタン部分 - グラフの下と一覧の上に配置 */}
        <div className="flex justify-end gap-4">
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={() => router.push(`/temperature?department=${encodeURIComponent(departmentName)}&departmentId=${selectedDepartmentId}`)}
              className="bg-gradient-to-r from-blue-300 to-purple-300 hover:from-blue-400 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              温度管理画面へ戻る
            </Button>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={downloadCSV}
              className="bg-gradient-to-r from-pink-300 to-purple-400 hover:from-pink-400 hover:to-purple-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Download className="mr-2 h-5 w-5" />
              CSVダウンロード
            </Button>
          </motion.div>
        </div>

        {/* データテーブル */}
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <h3 className="text-lg font-medium p-4 border-b">センサーデータ一覧</h3>
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="mt-4 text-gray-500">データを読み込み中...</p>
            </div>
          ) : !selectedDepartmentId ? (
            <div className="p-8 text-center text-red-600">
              <Filter className="h-16 w-16 text-red-300 mx-auto mb-2" />
              <p>部門が設定されていません。プロフィール設定を確認してください。</p>
            </div>
          ) : !selectedDeviceId ? (
            <div className="p-8 text-center text-amber-600">
              <Filter className="h-16 w-16 text-amber-300 mx-auto mb-2" />
              <p>表示するセンサーデバイスを選択してください</p>
            </div>
          ) : sensorLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Filter className="h-16 w-16 text-gray-300 mx-auto mb-2" />
              <p>選択した期間にデータがありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-border">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">日時</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">AHT20温度 (℃)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">BMP280温度 (℃)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">AHT20湿度 (%)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">BMP280気圧 (hPa)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">バッテリー電圧 (V)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">バッテリー残量 (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {(() => {
                          // UTCのまま表示（日本時間に変換しない）
                          const utcDate = log.recorded_at.split('.')[0]; // ミリ秒部分を除去
                          const [datePart, timePart] = utcDate.split('T');
                          const [year, month, day] = datePart.split('-');
                          const [hours, minutes] = timePart.split(':');
                          
                          // yyyy/MM/dd HH:mm形式で返す（UTCのまま、秒を切り捨て）
                          return `${year}/${month}/${day} ${hours}:${minutes}`;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-red-600">
                        {log.raw_data?.ahtTemp !== null && log.raw_data?.ahtTemp !== undefined
                          ? log.raw_data.ahtTemp.toFixed(1)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-orange-600">
                        {log.raw_data?.bmpTemp !== null && log.raw_data?.bmpTemp !== undefined
                          ? log.raw_data.bmpTemp.toFixed(1)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-blue-600">
                        {log.raw_data?.ahtHum !== null && log.raw_data?.ahtHum !== undefined
                          ? log.raw_data.ahtHum.toFixed(1)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-teal-600">
                        {log.raw_data?.bmpPres !== null && log.raw_data?.bmpPres !== undefined
                          ? log.raw_data.bmpPres.toFixed(1)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-purple-600">
                        {log.raw_data?.batteryVolt !== null && log.raw_data?.batteryVolt !== undefined
                          ? log.raw_data.batteryVolt.toFixed(3)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-indigo-600">
                        {log.raw_data?.batteryVolt !== null && log.raw_data?.batteryVolt !== undefined
                          ? (() => {
                              const minVoltage = 3.000;
                              const maxVoltage = 3.300;
                              const percentage = ((log.raw_data.batteryVolt - minVoltage) / (maxVoltage - minVoltage)) * 100;
                              return Math.max(0, Math.min(100, percentage)).toFixed(0) + '%';
                            })()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ページングコントロール */}
        {totalItems > 0 && (
          <div className="bg-white p-4 rounded-lg border border-border shadow-sm mt-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="text-sm text-gray-500">
                {totalItems} 件中 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} 件を表示
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">表示件数:</label>
                <select 
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1); // 表示件数変更時は1ページ目に戻る
                  }}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                >
                  <option value="10">10件</option>
                  <option value="20">20件</option>
                  <option value="50">50件</option>
                </select>
              </div>
              
              <nav className="inline-flex rounded-md shadow">
                <button
                  onClick={() => handlePageChange(1)}
                  className="px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === 1}
                >
                  最初
                </button>
                
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="px-3 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === 1}
                >
                  前へ
                </button>
                
                {/* ページ番号 */}
                <div className="flex">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // 表示するページ番号の計算
                    // 現在のページを中心に最大5つのページ番号を表示
                    let pageNum = currentPage - 2 + i;
                    
                    // 最初のページから表示する場合の調整
                    if (currentPage < 3) {
                      pageNum = i + 1;
                    }
                    
                    // 最後のページから表示する場合の調整
                    if (currentPage > totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    }
                    
                    // 有効なページ番号のみ表示
                    if (pageNum > 0 && pageNum <= totalPages) {
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-2 border-t border-b border-gray-300 text-sm font-medium ${
                            pageNum === currentPage
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="px-3 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === totalPages}
                >
                  次へ
                </button>
                
                <button
                  onClick={() => handlePageChange(totalPages)}
                  className="px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === totalPages}
                >
                  最後
                </button>
              </nav>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 