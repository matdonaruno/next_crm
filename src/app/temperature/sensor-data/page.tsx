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
  device_name: string;
  ip_address: string;
  location: string | null;
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
  const departmentName = searchParams?.get("department") || "部署未指定";
  const departmentId = searchParams?.get("departmentId") || "";
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
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(deviceId); // 選択されたデバイスID

  // 施設情報の取得
  useEffect(() => {
    const fetchFacilityInfo = async () => {
      try {
        console.log('施設情報を取得中...');
        
        // キャッシュから施設情報を取得
        const cachedFacility = localStorage.getItem('facilityCache');
        console.log('キャッシュされた施設情報:', cachedFacility);
        
        if (cachedFacility) {
          try {
            const { id, name } = JSON.parse(cachedFacility);
            console.log('キャッシュから施設情報を設定します:', { id, name });
            setFacilityId(id);
            setFacilityName(name);
            return;
          } catch (e) {
            console.error('キャッシュされた施設情報の解析に失敗しました:', e);
          }
        }

        // キャッシュにない場合はSupabaseから取得
        console.log('Supabaseから施設情報を取得します...');
        const { data: userData, error: userError } = await supabase
          .from('profiles')
          .select('facility_id')
          .single();

        if (userError) {
          console.error('ユーザー情報取得エラー:', userError);
          return;
        }

        console.log('取得したユーザー情報:', userData);

        if (userData?.facility_id) {
          console.log(`施設ID ${userData.facility_id} の詳細を取得中...`);
          const { data: facilityData, error: facilityError } = await supabase
            .from('facilities')
            .select('id, name')
            .eq('id', userData.facility_id)
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

    fetchFacilityInfo();
  }, []);

  // センサーデータとデバイス情報の取得
  useEffect(() => {
    if (!facilityId) {
      console.log('施設IDが不足しています');
      return;
    }

    // すべての利用可能なセンサーデバイスを取得
    const fetchAvailableDevices = async () => {
      try {
        console.log('利用可能なセンサーデバイスを検索中...');
        let query = supabase
          .from('sensor_devices')
          .select('id, device_name, ip_address, location')
          .eq('facility_id', facilityId);
        
        // 部署IDが指定されている場合は絞り込み
        if (departmentId) {
          query = query.eq('department_id', departmentId);
        }
        
        const { data, error } = await query;

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
            }
          }
        } else {
          console.log('センサーデバイスが見つかりませんでした');
        }
      } catch (error) {
        console.error('デバイス検索エラー:', error);
      }
    };

    fetchAvailableDevices();
  }, [facilityId, departmentId, selectedDeviceId]);

  // 選択されたデバイスのセンサーログを取得
  useEffect(() => {
    if (!selectedDeviceId) {
      console.log('デバイスIDが選択されていません');
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
          .order('recorded_at', { ascending: true });

        if (logError) {
          console.error('センサーログ取得エラー:', logError);
          setSensorLogs([]);
        } else if (logData && logData.length > 0) {
          console.log(`センサーログを ${logData.length} 件発見しました`);
          setSensorLogs(logData);
        } else {
          console.log('センサーログが見つかりませんでした。検索期間を確認してください。');
          setSensorLogs([]);
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
        setSensorLogs([]);
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
          .order('recorded_at', { ascending: true });

        if (error) {
          console.error('センサーログ更新エラー:', error);
          setSensorLogs([]);
        } else if (data && data.length > 0) {
          console.log(`センサーログを ${data.length} 件更新しました`);
          setSensorLogs(data);
        } else {
          console.log('更新されたセンサーログはありません');
          setSensorLogs([]);
        }
      } catch (error) {
        console.error('データ更新エラー:', error);
        setSensorLogs([]);
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

    const labels = sensorLogs.map(log => new Date(log.recorded_at));
    
    // センサー値の抽出
    const ahtTempData = sensorLogs.map(log => log.raw_data?.ahtTemp ?? null);
    const bmpTempData = sensorLogs.map(log => log.raw_data?.bmpTemp ?? null);
    const ahtHumData = sensorLogs.map(log => log.raw_data?.ahtHum ?? null);
    const bmpPresData = sensorLogs.map(log => log.raw_data?.bmpPres ?? null);
    const batteryVoltData = sensorLogs.map(log => log.raw_data?.batteryVolt ?? null);

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
            
            {/* デバイス選択ドロップダウン */}
            {availableDevices.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">デバイス選択</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {availableDevices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.device_name} {device.location ? `(${device.location})` : ''}
                    </option>
                  ))}
                </select>
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
              <button
                onClick={downloadCSV}
                className="flex items-center gap-1 px-3 py-2 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition"
                disabled={sensorLogs.length === 0}
              >
                <Download className="h-4 w-4" />
                <span>CSVダウンロード</span>
              </button>
            </div>
          </div>
        </div>

        {/* センサー情報 */}
        {sensorDevice && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-100">
            <h3 className="text-sm font-medium mb-2 text-purple-800">センサーデバイス情報</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* データテーブル */}
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <h3 className="text-lg font-medium p-4 border-b">センサーデータ一覧</h3>
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="mt-4 text-gray-500">データを読み込み中...</p>
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
                  {sensorLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {new Date(log.recorded_at).toLocaleString()}
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

        {/* ボタン部分 */}
        <div className="flex justify-end gap-4">
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={() => router.push(`/temperature?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`)}
              className="bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              温度管理画面へ戻る
              <ArrowLeft className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={downloadCSV}
              className="bg-gradient-to-r from-blue-400 to-indigo-500 hover:from-blue-500 hover:to-indigo-600 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              CSVダウンロード
              <Download className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </main>
    </div>
  );
} 