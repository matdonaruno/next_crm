// src/app/admin/sensor-monitor/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/app/_providers/supabase-provider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Activity, Terminal, RefreshCw, AlertTriangle, Thermometer, Droplets, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface SensorDevice {
  id: string;
  device_name: string;
  ip_address: string | null;
  device_id?: string | null;
  last_seen: string | null;
  status: string | null;
  isOnline: boolean;
  facilities: { name: string } | null;
  departments: { name: string } | null;
}

interface SensorLog {
  id: string;
  sensor_device_id: string | null;
  raw_data: {
    ahtTemp: number | null;
    ahtHum: number | null;
    bmpTemp: number | null;
    bmpPres: number | null;
  };
  recorded_at: string;
  sensor_devices?: {
    device_name: string;
  } | null;
}

export default function SensorMonitor() {
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [logs, setLogs] = useState<SensorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { supabase } = useSupabase();
  const { toast } = useToast();
  
  const fetchData = async () => {
    setLoading(true);
    try {
      // デバイス・ログを並列取得
      const [
        { data: deviceData, error: deviceError },
        { data: logData, error: logError }
      ] = await Promise.all([
        supabase
          .from('sensor_devices')
          .select(`
            id,
            device_name,
            ip_address,
            device_id,
            last_seen,
            status,
            facilities(name),
            departments(name)
          `)
          .order('last_seen', { ascending: false }),
        supabase
          .from('sensor_logs')
          .select(`
            id,
            sensor_device_id,
            raw_data,
            recorded_at,
            sensor_devices(device_name)
          `)
          .order('recorded_at', { ascending: false })
          .limit(50)
      ]);

      // デバイス処理
      if (deviceError) {
        console.error('デバイス取得エラー:', deviceError);
        toast({ title: 'デバイス取得エラー', variant: 'destructive' });
      } else if (deviceData) {
        const now = Date.now();
        const processedDevices: SensorDevice[] = deviceData.map((d) => {
          const lastSeenMs = d.last_seen ? new Date(d.last_seen).getTime() : 0;
          const isOnline = lastSeenMs !== 0 && now - lastSeenMs < 15 * 60 * 1000;
          return { ...d, isOnline };
        });
        setDevices(processedDevices);
      }

      // ログ処理
      if (logError) {
        console.error('ログ取得エラー:', logError);
        toast({ title: 'ログ取得エラー', variant: 'destructive' });
      } else if (logData) {
        setLogs(logData as SensorLog[]);
      }
    } catch (error) {
      console.error('データ取得例外:', error);
      toast({
        title: 'データ取得例外',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();

    // 定期的な更新（1分ごと）
    const interval = setInterval(fetchData, 60 * 1000);

    // リアルタイム更新のサブスクリプション
    const subscription = supabase
      .channel('sensor_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_logs' }, fetchData)
      .subscribe();

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [supabase]); // Provider が変わった場合に再登録
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">センサーモニタリング</h1>
        <Button 
          onClick={fetchData} 
          variant="outline"
          className="border-pink-200 text-pink-700"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          最新の状態に更新
        </Button>
      </div>
      
      {/* デバイス状態一覧 */}
      <h2 className="text-xl font-semibold mb-4">デバイスステータス</h2>
      {loading ? (
        <div className="text-center py-8">
          <div className="spinner"></div>
          <p className="mt-2 text-gray-500">デバイス情報を読み込み中...</p>
        </div>
      ) : devices.length === 0 ? (
        <Card className="border-pink-200 text-center py-8 mb-8">
          <CardContent>
            <AlertTriangle className="h-12 w-12 mx-auto text-pink-300 mb-2" />
            <p className="text-gray-500">登録されたデバイスがありません</p>
            <Button 
              onClick={() => window.location.href = '/admin/sensors'} 
              className="mt-4 bg-gradient-to-r from-pink-400 to-purple-500 text-white"
            >
              デバイス管理へ
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {devices.map(device => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className={`border-l-4 ${device.isOnline ? 'border-l-green-500' : 'border-l-red-500'} shadow-md hover:shadow-lg transition-shadow`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center text-lg">
                    <Activity className={`mr-2 h-5 w-5 ${device.isOnline ? 'text-green-500' : 'text-red-500'}`} />
                    {device.device_name}
                    <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${
                      device.isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {device.isOnline ? 'オンライン' : 'オフライン'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">IPアドレス:</span>
                      <span>{device.ip_address}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">デバイスID:</span>
                      <span>{device.device_id || '未設定'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">施設:</span>
                      <span>{device.facilities?.name || '未設定'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">部署:</span>
                      <span>{device.departments?.name || '未設定'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">最終応答:</span>
                      <span>{device.last_seen ? new Date(device.last_seen).toLocaleString() : '未応答'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
      
      {/* 最新のセンサーログ */}
      <h2 className="text-xl font-semibold mb-4">最新のセンサーデータ</h2>
      <Card className="border-pink-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-pink-50 to-purple-50 border-b">
                  <th className="p-3 text-left">時刻</th>
                  <th className="p-3 text-left">デバイス</th>
                  <th className="p-3 text-center">AHT20温度</th>
                  <th className="p-3 text-center">AHT20湿度</th>
                  <th className="p-3 text-center">BMP280温度</th>
                  <th className="p-3 text-center">BMP280気圧</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      <Terminal className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                      センサーデータがありません
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{new Date(log.recorded_at).toLocaleString()}</td>
                      <td className="p-3">{log.sensor_devices?.device_name || log.sensor_device_id || '不明'}</td>
                      <td className="p-3 text-center">
                        {log.raw_data?.ahtTemp !== null && log.raw_data?.ahtTemp !== undefined ? (
                          <div className="flex items-center justify-center">
                            <Thermometer className="h-4 w-4 mr-1 text-red-500" />
                            <span>{log.raw_data.ahtTemp.toFixed(1)}℃</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        {log.raw_data?.ahtHum !== null && log.raw_data?.ahtHum !== undefined ? (
                          <div className="flex items-center justify-center">
                            <Droplets className="h-4 w-4 mr-1 text-blue-500" />
                            <span>{log.raw_data.ahtHum.toFixed(1)}%</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        {log.raw_data?.bmpTemp !== null && log.raw_data?.bmpTemp !== undefined ? (
                          <div className="flex items-center justify-center">
                            <Thermometer className="h-4 w-4 mr-1 text-amber-500" />
                            <span>{log.raw_data.bmpTemp.toFixed(1)}℃</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        {log.raw_data?.bmpPres !== null && log.raw_data?.bmpPres !== undefined ? (
                          <div className="flex items-center justify-center">
                            <Gauge className="h-4 w-4 mr-1 text-indigo-500" />
                            <span>{log.raw_data.bmpPres.toFixed(1)}hPa</span>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <style jsx global>{`
        .spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border-left-color: #f472b6;
          margin: 0 auto;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 