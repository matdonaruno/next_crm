'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Home, Bell, Activity, Calendar, Download, Filter, RefreshCw } from 'lucide-react';
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

  const [sensorLogs, setSensorLogs] = useState<SensorLog[]>([]);
  const [sensorDevice, setSensorDevice] = useState<SensorDevice | null>(null);
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
  const [dataType, setDataType] = useState<'temperature' | 'humidity' | 'pressure'>('temperature');

  // 施設情報の取得
  useEffect(() => {
    const fetchFacilityInfo = async () => {
      try {
        // キャッシュから施設情報を取得
        const cachedFacility = localStorage.getItem('facilityCache');
        if (cachedFacility) {
          const { id, name } = JSON.parse(cachedFacility);
          setFacilityId(id);
          setFacilityName(name);
          return;
        }
      } catch (error) {
        console.error('施設情報の取得に失敗:', error);
      }
    };

    fetchFacilityInfo();
  }, []);

  // センサーデータとデバイス情報の取得
  useEffect(() => {
    if (!departmentId || !facilityId) return;

    const fetchSensorData = async () => {
      setLoading(true);
      try {
        // センサーデバイスの取得
        const { data: deviceData, error: deviceError } = await supabase
          .from('sensor_devices')
          .select('id, device_name, ip_address, location')
          .eq('department_id', departmentId)
          .eq('facility_id', facilityId)
          .single();

        if (deviceError) {
          console.error('センサーデバイス取得エラー:', deviceError);
          setLoading(false);
          return;
        }

        setSensorDevice(deviceData);

        // センサーログの取得
        const { data: logData, error: logError } = await supabase
          .from('sensor_logs')
          .select('id, raw_data, recorded_at')
          .eq('sensor_device_id', deviceData.id)
          .gte('recorded_at', `${startDate}T00:00:00`)
          .lte('recorded_at', `${endDate}T23:59:59`)
          .order('recorded_at', { ascending: true });

        if (logError) {
          console.error('センサーログ取得エラー:', logError);
        } else if (logData) {
          setSensorLogs(logData);
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSensorData();
  }, [departmentId, facilityId, startDate, endDate]);

  // データ更新
  const refreshData = () => {
    if (!departmentId || !facilityId || !sensorDevice) return;
    
    const fetchUpdatedData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('sensor_logs')
          .select('id, raw_data, recorded_at')
          .eq('sensor_device_id', sensorDevice.id)
          .gte('recorded_at', `${startDate}T00:00:00`)
          .lte('recorded_at', `${endDate}T23:59:59`)
          .order('recorded_at', { ascending: true });

        if (error) {
          console.error('センサーログ更新エラー:', error);
        } else if (data) {
          setSensorLogs(data);
        }
      } catch (error) {
        console.error('データ更新エラー:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUpdatedData();
  };

  // CSVダウンロード
  const downloadCSV = () => {
    if (!sensorLogs.length) return;

    let csvContent = "日時,AHT20温度(℃),BMP280温度(℃),AHT20湿度(%),BMP280気圧(hPa)\n";
    
    sensorLogs.forEach(log => {
      const date = new Date(log.recorded_at).toLocaleString();
      const ahtTemp = log.raw_data?.ahtTemp !== null ? log.raw_data.ahtTemp.toFixed(1) : "";
      const bmpTemp = log.raw_data?.bmpTemp !== null ? log.raw_data.bmpTemp.toFixed(1) : "";
      const ahtHum = log.raw_data?.ahtHum !== null ? log.raw_data.ahtHum.toFixed(1) : "";
      const bmpPres = log.raw_data?.bmpPres !== null ? log.raw_data.bmpPres.toFixed(1) : "";
      
      csvContent += `${date},${ahtTemp},${bmpTemp},${ahtHum},${bmpPres}\n`;
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

    // データタイプに応じたデータセット
    if (dataType === 'temperature') {
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
          },
          {
            label: 'BMP280温度 (℃)',
            data: bmpTempData,
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.5)',
            tension: 0.1,
            pointRadius: 2,
          }
        ]
      };
    } else if (dataType === 'humidity') {
      return {
        labels,
        datasets: [
          {
            label: 'AHT20湿度 (%)',
            data: ahtHumData,
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            tension: 0.1,
            pointRadius: 2,
          }
        ]
      };
    } else {
      return {
        labels,
        datasets: [
          {
            label: 'BMP280気圧 (hPa)',
            data: bmpPresData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            pointRadius: 2,
          }
        ]
      };
    }
  }, [sensorLogs, dataType]);

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
        text: dataType === 'temperature' ? '温度データ' : dataType === 'humidity' ? '湿度データ' : '気圧データ',
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
      y: {
        title: {
          display: true,
          text: dataType === 'temperature' ? '温度 (℃)' : dataType === 'humidity' ? '湿度 (%)' : '気圧 (hPa)'
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">データタイプ</label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="temperature">温度データ</option>
                <option value="humidity">湿度データ</option>
                <option value="pressure">気圧データ</option>
              </select>
            </div>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 