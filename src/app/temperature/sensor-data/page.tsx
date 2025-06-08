// src/app/temperature/sensor-data/page.tsx
'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  Home,
  Bell,
  Activity,
  Download,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import supabase from '@/lib/supabaseBrowser';
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
  TimeScale,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { ja } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useSimpleAuth } from '@/hooks/useSimpleAuth';
import { useSessionCheck } from '@/hooks/useSessionCheck';

// Chart.js registration
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
);

interface SensorLog {
  id: string;
  raw_data: {
    ahtTemp: number;
    bmpTemp: number;
    ahtHum: number;
    bmpPres: number;
    batteryVolt: number;
  };
  recorded_at: string;
}

interface SensorDevice {
  id: string;
  device_id: string;
  device_name: string;
  ip_address: string;
  location: string;
}

export default function SensorDataPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-12 w-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-pink-700 text-center">読み込み中...</p>
          </div>
        </div>
      }
    >
      <SensorDataContent />
    </Suspense>
  );
}

function SensorDataContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') ?? '';
  const departmentId = searchParams?.get('departmentId') ?? '';
  const deviceIdParam = searchParams?.get('deviceId') ?? '';

  useSessionCheck();
  const { user, loading: authLoading } = useSimpleAuth();

  const [sensorLogs, setSensorLogs] = useState<SensorLog[]>([]);
  const [availableDevices, setAvailableDevices] = useState<SensorDevice[]>([]);
  const [sensorDevice, setSensorDevice] = useState<SensorDevice | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateRange, setDateRange] = useState<'1W' | '2W' | '1M' | 'custom'>('1W');

  const [loading, setLoading] = useState(true);

  // 認証リダイレクト
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // 日付範囲変更
  useEffect(() => {
    if (dateRange === '1W') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().slice(0, 10));
    } else if (dateRange === '2W') {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      setStartDate(d.toISOString().slice(0, 10));
    } else if (dateRange === '1M') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      setStartDate(d.toISOString().slice(0, 10));
    }
  }, [dateRange]);

  // デバイス一覧取得
  useEffect(() => {
    async function fetchDevices() {
      setLoading(true);
      try {
        const { data: profileData } = await supabase.auth.getUser();
        const fid = (profileData.user?.user_metadata as any)?.facility_id as string;
        if (!fid) throw new Error('Facility ID missing');

        const { data: devs } = await supabase
          .from('sensor_devices')
          .select('id, device_id, device_name, ip_address, location')
          .eq('department_id', departmentId)
          .eq('facility_id', fid);
        const safeDevs: SensorDevice[] = (devs ?? []).map((d) => ({
          id: d.id,
          device_id: d.device_id ?? '',
          device_name: d.device_name,
          ip_address: d.ip_address ?? '',
          location: d.location ?? '',
        }));
        setAvailableDevices(safeDevs);

        const choose = safeDevs.find((d) => d.id === deviceIdParam) ?? safeDevs[0];
        if (choose) setSensorDevice(choose);
      } catch (e) {
        console.error('fetchDevices error', e);
      } finally {
        setLoading(false);
      }
    }
    if (departmentId) fetchDevices();
  }, [departmentId, deviceIdParam]);

  // ログ取得
  useEffect(() => {
    async function fetchLogs() {
      if (!sensorDevice) return;
      setLoading(true);
      try {
        const from = `${startDate}T00:00:00`;
        const to = `${endDate}T23:59:59`;
        const { data: logs } = await supabase
          .from('sensor_logs')
          .select('id, raw_data, recorded_at')
          .eq('sensor_device_id', sensorDevice.id)
          .gte('recorded_at', from)
          .lte('recorded_at', to)
          .order('recorded_at', { ascending: false });

        const safeLogs: SensorLog[] = (logs ?? []).map((r) => {
          const raw = r.raw_data as any;
          return {
            id: r.id,
            recorded_at: r.recorded_at ?? '',
            raw_data: {
              ahtTemp: raw?.ahtTemp ?? 0,
              bmpTemp: raw?.bmpTemp ?? 0,
              ahtHum: raw?.ahtHum ?? 0,
              bmpPres: raw?.bmpPres ?? 0,
              batteryVolt: raw?.batteryVolt ?? 0,
            },
          };
        });
        setSensorLogs(safeLogs);
      } catch (e) {
        console.error('fetchLogs error', e);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [sensorDevice, startDate, endDate]);

  const chartData = useMemo(() => {
    if (!sensorLogs.length) return null;
    const sorted = [...sensorLogs].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );
    return {
      labels: sorted.map((r) => new Date(r.recorded_at)),
      datasets: [
        {
          label: 'AHT20 温度',
          data: sorted.map((r) => r.raw_data.ahtTemp),
          tension: 0.1,
        },
        {
          label: 'BMP280 温度',
          data: sorted.map((r) => r.raw_data.bmpTemp),
          tension: 0.1,
        },
        {
          label: 'AHT20 湿度',
          data: sorted.map((r) => r.raw_data.ahtHum),
          tension: 0.1,
        },
        {
          label: 'BMP280 気圧',
          data: sorted.map((r) => r.raw_data.bmpPres),
          tension: 0.1,
        },
      ],
    };
  }, [sensorLogs]);

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day' as const },
        adapters: { date: { locale: ja } },
      },
    },
  };

  const handleRefresh = () => {
    setSensorLogs((prev) => [...prev]);
  };

  const downloadCSV = () => {
    if (!sensorLogs.length) return;
    let csv = '日時,AHT20温度,BMP280温度,AHT20湿度,BMP280気圧,バッテリー電圧\n';
    sensorLogs.forEach((r) => {
      const dt = new Date(r.recorded_at).toLocaleString();
      const { ahtTemp, bmpTemp, ahtHum, bmpPres, batteryVolt } = r.raw_data;
      csv += `${dt},${ahtTemp},${bmpTemp},${ahtHum},${bmpPres},${batteryVolt}\n`;
    });
    const uri = encodeURI('data:text/csv;charset=utf-8,' + csv);
    const link = document.createElement('a');
    link.href = uri;
    link.download = `sensor_logs_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="border-b border-border bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => router.back()}>
            <ChevronLeft />
          </button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity /> センサーデータ
          </h1>
          <div className="flex gap-2">
            <button onClick={() => router.push('/depart')}>
              <Home />
            </button>
            <Bell />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* フィルター */}
        <div className="bg-white p-4 rounded border flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm">期間</label>
            <div className="flex border rounded overflow-hidden">
              {(['1W', '2W', '1M', 'custom'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-2 text-sm ${
                    dateRange === r ? 'bg-blue-500 text-white' : 'bg-white'
                  }`}
                >
                  {r === '1W'
                    ? '1週間'
                    : r === '2W'
                    ? '2週間'
                    : r === '1M'
                    ? '1ヶ月'
                    : 'カスタム'}
                </button>
              ))}
            </div>
          </div>
          {dateRange === 'custom' && (
            <>
              <div>
                <label className="block text-sm">開始日</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border px-2 py-1 rounded"
                />
              </div>
              <div>
                <label className="block text-sm">終了日</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border px-2 py-1 rounded"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm">部門</label>
            <div className="border px-2 py-1 rounded bg-gray-50">{departmentName}</div>
          </div>
          <div>
            <label className="block text-sm">デバイス</label>
            <select
              value={sensorDevice?.id ?? ''}
              onChange={(e) => {
                const d = availableDevices.find((d) => d.id === e.target.value);
                setSensorDevice(d ?? null);
              }}
              className="border px-2 py-1 rounded"
            >
              <option value="">選択してください</option>
              {availableDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.device_name} ({d.location})
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={handleRefresh}>
              <RefreshCw /> 更新
            </Button>
            <Button onClick={downloadCSV}>
              <Download /> CSV
            </Button>
          </div>
        </div>

        {/* グラフ */}
        <div className="bg-white p-4 rounded border">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="h-12 w-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData ? (
            <div className="h-80">
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              データがありません
            </div>
          )}
        </div>

        {/* 一覧 */}
        <div className="bg-white p-4 rounded border overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2">日時</th>
                <th className="px-4 py-2">AHT20温度</th>
                <th className="px-4 py-2">BMP280温度</th>
                <th className="px-4 py-2">AHT20湿度</th>
                <th className="px-4 py-2">BMP280気圧</th>
                <th className="px-4 py-2">電圧</th>
              </tr>
            </thead>
            <tbody>
              {sensorLogs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-100">
                  <td className="px-4 py-2 text-sm">
                    {new Date(r.recorded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm">{r.raw_data.ahtTemp.toFixed(1)}</td>
                  <td className="px-4 py-2 text-sm">{r.raw_data.bmpTemp.toFixed(1)}</td>
                  <td className="px-4 py-2 text-sm">{r.raw_data.ahtHum.toFixed(1)}</td>
                  <td className="px-4 py-2 text-sm">{r.raw_data.bmpPres.toFixed(1)}</td>
                  <td className="px-4 py-2 text-sm">{r.raw_data.batteryVolt.toFixed(3)}V</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 戻る */}
        <div className="flex justify-end">
          <Button
            onClick={() =>
              router.push(
                `/temperature?department=${encodeURIComponent(
                  departmentName,
                )}&departmentId=${departmentId}`,
              )
            }
          >
            <ArrowLeft /> 戻る
          </Button>
        </div>
      </main>
    </div>
  );
}
