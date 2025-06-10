// src/app/admin/sensor-monitor/page.tsx
'use client';

import { useState, useEffect } from 'react';
import supabase from '@/lib/supabaseBrowser';
import AdminRoute from '@/components/auth/AdminRoute';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Activity, Terminal, RefreshCw, AlertTriangle, Thermometer, Droplets, Gauge, Filter, Building, Users, Settings, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { formatJSTDateTime } from '@/lib/utils';
import AdminNavigation from '@/components/admin/AdminNavigation';

interface SensorDevice {
  id: string;
  device_name: string;
  ip_address: string | null;
  device_id?: string | null;
  last_seen: string | null;
  status: string | null;
  isOnline: boolean;
  connectionStatus: 'online' | 'sleeping' | 'offline';
  facilities: { name: string } | null;
  departments: { name: string } | null;
  facility_id: string | null;
}

interface Facility {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
  facility_id: string;
}

interface SensorLog {
  id: string;
  sensor_device_id: string | null;
  raw_data: {
    ahtTemp: number | null;
    ahtHum: number | null;
    bmpTemp: number | null;
    bmpPres: number | null;
    timestamp?: number; // センサーの実測時刻（Unix timestamp）
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
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const { toast } = useToast();
  
  // フィルタリング用のState
  const [selectedFacility, setSelectedFacility] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'sleeping' | 'offline'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'facility' | 'department' | 'status'>('status');
  
  // IPv6アドレスの正規化
  const normalizeIpAddress = (ip: string | null): string => {
    if (!ip) return '';
    // ::ffff: prefixを削除してIPv4アドレスのみを表示
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  };
  
  const fetchData = async () => {
    setLoading(true);
    try {
      // 施設・部署・デバイス・ログを並列取得
      const [
        { data: facilityData, error: facilityError },
        { data: departmentData, error: departmentError },
        { data: deviceData, error: deviceError },
        { data: logData, error: logError }
      ] = await Promise.all([
        supabase
          .from('facilities')
          .select('id, name')
          .order('name'),
        supabase
          .from('departments')
          .select('id, name, facility_id')
          .order('name'),
        supabase
          .from('sensor_devices')
          .select(`
            id,
            device_name,
            ip_address,
            device_id,
            last_seen,
            status,
            facility_id,
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
            measurement_timestamp,
            sensor_devices(device_name)
          `)
          .order('recorded_at', { ascending: false })
          .limit(50)
      ]);

      // 施設データ処理
      if (facilityError) {
        console.error('施設取得エラー:', facilityError);
      } else if (facilityData) {
        setFacilities(facilityData);
      }

      // 部署データ処理
      if (departmentError) {
        console.error('部署取得エラー:', departmentError);
      } else if (departmentData) {
        setDepartments(departmentData);
      }

      // デバイス処理
      if (deviceError) {
        console.error('デバイス取得エラー:', deviceError);
        toast({ title: 'デバイス取得エラー', variant: 'destructive' });
      } else if (deviceData) {
        const now = Date.now();
        const processedDevices: SensorDevice[] = deviceData.map((d) => {
          const lastSeenMs = d.last_seen ? new Date(d.last_seen).getTime() : 0;
          const timeSinceLastSeen = now - lastSeenMs;
          
          // ステータス判定ロジック
          let connectionStatus: 'online' | 'sleeping' | 'offline';
          let isOnline: boolean;
          
          if (lastSeenMs === 0) {
            // 一度も応答がない場合
            connectionStatus = 'offline';
            isOnline = false;
          } else if (timeSinceLastSeen < 5 * 60 * 1000) {
            // 5分以内：オンライン（常時接続デバイス）
            connectionStatus = 'online';
            isOnline = true;
          } else if (timeSinceLastSeen < 30 * 60 * 1000) {
            // 5-30分：スリープ中（Deep Sleepデバイス）
            connectionStatus = 'sleeping';
            isOnline = true; // フィルタリングでは「稼働中」として扱う
          } else {
            // 30分以上：オフライン（異常状態）
            connectionStatus = 'offline';
            isOnline = false;
          }
          
          return { ...d, isOnline, connectionStatus };
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

  // フィルタリング・グループ化ロジック
  const filteredDevices = devices.filter((device) => {
    // 施設フィルター
    if (selectedFacility !== 'all') {
      if (device.facility_id !== selectedFacility) return false;
    }
    
    // 部署フィルター
    if (selectedDepartment !== 'all') {
      if (device.departments?.name !== selectedDepartment) return false;
    }
    
    // ステータスフィルター
    if (statusFilter !== 'all') {
      if (statusFilter === 'online' && device.connectionStatus !== 'online') return false;
      if (statusFilter === 'sleeping' && device.connectionStatus !== 'sleeping') return false;
      if (statusFilter === 'offline' && device.connectionStatus !== 'offline') return false;
    }
    
    return true;
  });

  const groupedDevices = () => {
    if (groupBy === 'none') {
      return [{ group: 'すべて', devices: filteredDevices }];
    }
    
    const groups: { [key: string]: SensorDevice[] } = {};
    
    filteredDevices.forEach((device) => {
      let groupKey = 'その他';
      
      if (groupBy === 'facility') {
        groupKey = device.facilities?.name || 'その他';
      } else if (groupBy === 'department') {
        groupKey = device.departments?.name || 'その他';
      } else if (groupBy === 'status') {
        switch (device.connectionStatus) {
          case 'online':
            groupKey = 'オンライン';
            break;
          case 'sleeping':
            groupKey = 'スリープ中';
            break;
          case 'offline':
            groupKey = 'オフライン';
            break;
          default:
            groupKey = 'その他';
        }
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(device);
    });
    
    return Object.entries(groups).map(([group, devices]) => ({
      group,
      devices
    })).sort((a, b) => {
      // ステータスでグループ化する場合は、優先順位で並び替え
      if (groupBy === 'status') {
        const statusOrder = { 'オンライン': 1, 'スリープ中': 2, 'オフライン': 3 };
        const aOrder = statusOrder[a.group as keyof typeof statusOrder] || 99;
        const bOrder = statusOrder[b.group as keyof typeof statusOrder] || 99;
        return aOrder - bOrder;
      }
      return a.group.localeCompare(b.group);
    });
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
  }, []); // supabase クライアントは固定なので依存配列は空
  
  return (
    <AdminRoute requiredRole="admin">
      <div className="min-h-screen bg-white">
        <div className="container mx-auto p-4">
        {/* header */}
        <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold mb-2 text-gray-800">センサーモニタリング</h1>
              <p className="text-gray-600">センサーデバイスのリアルタイム状態監視とデータ表示</p>
            </div>
            <Button 
              onClick={fetchData} 
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              最新の状態に更新
            </Button>
          </div>
        </div>

        {/* admin navigation */}
        <AdminNavigation />

        {/* info card */}
        <Card className="mb-6 border-blue-200 bg-white shadow-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
            <CardTitle className="flex items-center">
              <Info className="mr-2 h-5 w-5 text-blue-600" />
              モニタリング情報
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center">
                <Activity className="h-4 w-4 mr-2 text-green-500" />
                <span>オンライン: 5分以内に応答</span>
              </div>
              <div className="flex items-center">
                <Terminal className="h-4 w-4 mr-2 text-blue-500" />
                <span>スリープ中: 5-30分以内に応答</span>
              </div>
              <div className="flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2 text-red-500" />
                <span>オフライン: 30分以上無応答</span>
              </div>
              <div className="flex items-center">
                <RefreshCw className="h-4 w-4 mr-2 text-purple-500" />
                <span>自動更新: 1分間隔</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* フィルタリング・ソートコントロール */}
        <Card className="mb-6 border-blue-200 bg-white shadow-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
            <CardTitle className="flex items-center text-sm">
              <Filter className="mr-2 h-4 w-4 text-blue-600" />
              フィルター・表示設定
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* 施設フィルター */}
              <div>
                <label className="flex items-center mb-2 text-sm font-medium">
                  <Building className="mr-1 h-4 w-4" />
                  施設
                </label>
                <select
                  className="w-full p-2 border border-blue-200 rounded"
                  value={selectedFacility}
                  onChange={(e) => setSelectedFacility(e.target.value)}
                >
                  <option value="all">すべての施設</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 部署フィルター */}
              <div>
                <label className="flex items-center mb-2 text-sm font-medium">
                  <Users className="mr-1 h-4 w-4" />
                  部署
                </label>
                <select
                  className="w-full p-2 border border-blue-200 rounded"
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                >
                  <option value="all">すべての部署</option>
                  {departments
                    .filter((dept) => selectedFacility === 'all' || dept.facility_id === selectedFacility)
                    .map((department) => (
                      <option key={department.id} value={department.name}>
                        {department.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* ステータスフィルター */}
              <div>
                <label className="flex items-center mb-2 text-sm font-medium">
                  <Activity className="mr-1 h-4 w-4" />
                  ステータス
                </label>
                <select
                  className="w-full p-2 border border-blue-200 rounded"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">すべて</option>
                  <option value="online">オンラインのみ</option>
                  <option value="sleeping">スリープ中のみ</option>
                  <option value="offline">オフラインのみ</option>
                </select>
              </div>

              {/* グループ化設定 */}
              <div>
                <label className="flex items-center mb-2 text-sm font-medium">
                  <Settings className="mr-1 h-4 w-4" />
                  グループ化
                </label>
                <select
                  className="w-full p-2 border border-blue-200 rounded"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                >
                  <option value="status">ステータス別</option>
                  <option value="facility">施設別</option>
                  <option value="department">部署別</option>
                  <option value="none">グループ化なし</option>
                </select>
              </div>
            </div>
            
            {/* 統計情報 */}
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="flex items-center text-sm text-gray-600 space-x-4 flex-wrap">
                <span>表示中: {filteredDevices.length}件 / 総件数: {devices.length}件</span>
                <span className="text-green-600">
                  オンライン: {devices.filter(d => d.connectionStatus === 'online').length}件
                </span>
                <span className="text-blue-600">
                  スリープ中: {devices.filter(d => d.connectionStatus === 'sleeping').length}件
                </span>
                <span className="text-red-600">
                  オフライン: {devices.filter(d => d.connectionStatus === 'offline').length}件
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      
        {/* デバイス状態一覧 */}
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">デバイス情報を読み込み中...</p>
          </div>
        ) : devices.length === 0 ? (
          <Card className="border-blue-200 bg-white text-center py-8 shadow-sm mb-8">
            <CardContent>
              <AlertTriangle className="h-12 w-12 mx-auto text-blue-300 mb-2" />
              <p className="text-gray-600">登録されたデバイスがありません</p>
              <p className="text-sm text-gray-400 mt-1">
                デバイス管理ページでセンサーを登録してください
              </p>
              <Button 
                onClick={() => window.location.href = '/admin/sensors'} 
                className="mt-4 bg-gradient-to-r from-blue-400 to-blue-600 text-white"
              >
                デバイス管理へ
              </Button>
            </CardContent>
          </Card>
        ) : filteredDevices.length === 0 ? (
          <Card className="border-blue-200 bg-white text-center py-8 shadow-sm mb-8">
            <CardContent>
              <Filter className="h-12 w-12 mx-auto text-blue-300 mb-2" />
              <p className="text-gray-600">選択された条件に一致するデバイスがありません</p>
              <p className="text-sm text-gray-400 mt-1">
                フィルター条件を変更してください
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 mb-8">
            {groupedDevices().map((group, groupIdx) => (
              <div key={group.group}>
                {/* グループヘッダー */}
                {groupBy !== 'none' && (
                  <div className="flex items-center mb-4">
                    <div className="flex items-center">
                      {groupBy === 'facility' ? (
                        <Building className="h-5 w-5 text-blue-600 mr-2" />
                      ) : groupBy === 'department' ? (
                        <Users className="h-5 w-5 text-blue-600 mr-2" />
                      ) : groupBy === 'status' ? (
                        group.group === 'オンライン' ? (
                          <Activity className="h-5 w-5 text-green-600 mr-2" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                        )
                      ) : (
                        <Settings className="h-5 w-5 text-blue-600 mr-2" />
                      )}
                      <h3 className="text-lg font-semibold text-gray-800">{group.group}</h3>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        groupBy === 'status' && group.group === 'オンライン' 
                          ? 'bg-green-100 text-green-600'
                          : groupBy === 'status' && group.group === 'オフライン'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {group.devices.length}件
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-blue-200 to-transparent ml-4"></div>
                  </div>
                )}

                {/* デバイスカード */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.devices.map((device, idx) => (
                    <motion.div
                      key={device.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: (groupIdx * group.devices.length + idx) * 0.05 }}
                    >
                      <Card className={`border-l-4 ${
                        device.connectionStatus === 'online' ? 'border-l-green-500' :
                        device.connectionStatus === 'sleeping' ? 'border-l-blue-500' : 'border-l-red-500'
                      } bg-white shadow-md hover:shadow-lg transition-shadow`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center text-lg">
                            {device.connectionStatus === 'online' ? (
                              <Activity className="mr-2 h-5 w-5 text-green-500" />
                            ) : device.connectionStatus === 'sleeping' ? (
                              <Terminal className="mr-2 h-5 w-5 text-blue-500" />
                            ) : (
                              <AlertTriangle className="mr-2 h-5 w-5 text-red-500" />
                            )}
                            {device.device_name}
                            <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${
                              device.connectionStatus === 'online' ? 'bg-green-100 text-green-800' :
                              device.connectionStatus === 'sleeping' ? 'bg-blue-100 text-blue-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {device.connectionStatus === 'online' ? 'オンライン' :
                               device.connectionStatus === 'sleeping' ? 'スリープ中' : 'オフライン'}
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">IPアドレス:</span>
                              <span>{normalizeIpAddress(device.ip_address)}</span>
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
                              <span>{device.last_seen ? formatJSTDateTime(device.last_seen) : '未応答'}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      
        {/* 最新のセンサーログ */}
        <Card className="border-blue-200 bg-white shadow-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
            <CardTitle className="flex items-center">
              <Terminal className="mr-2 h-5 w-5 text-blue-600" />
              最新のセンサーデータ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                    <th className="p-3 text-left font-medium text-gray-700">測定時刻</th>
                    <th className="p-3 text-left font-medium text-gray-700">受信時刻</th>
                    <th className="p-3 text-left font-medium text-gray-700">デバイス</th>
                    <th className="p-3 text-center font-medium text-gray-700">AHT20温度</th>
                    <th className="p-3 text-center font-medium text-gray-700">AHT20湿度</th>
                    <th className="p-3 text-center font-medium text-gray-700">BMP280温度</th>
                    <th className="p-3 text-center font-medium text-gray-700">BMP280気圧</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        <Terminal className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>センサーデータがありません</p>
                        <p className="text-sm text-gray-400 mt-1">デバイスからのデータ送信をお待ちください</p>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, index) => (
                      <motion.tr 
                        key={log.id} 
                        className="border-b hover:bg-blue-50 transition-colors"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.02 }}
                      >
                        <td className="p-3 text-sm">
                          {(log as any).measurement_timestamp ? 
                            <span className="text-gray-800">{formatJSTDateTime((log as any).measurement_timestamp)}</span> :
                            log.raw_data?.timestamp ? 
                              <span className="text-gray-800">{formatJSTDateTime(new Date(log.raw_data.timestamp * 1000).toISOString())}</span> :
                              <span className="text-gray-400">未記録</span>
                          }
                        </td>
                        <td className="p-3 text-sm">
                          <span className="text-gray-600">{formatJSTDateTime(log.recorded_at)}</span>
                        </td>
                        <td className="p-3 text-sm font-medium">{log.sensor_devices?.device_name || log.sensor_device_id || '不明'}</td>
                        <td className="p-3 text-center">
                          {log.raw_data?.ahtTemp !== null && log.raw_data?.ahtTemp !== undefined ? (
                            <div className="flex items-center justify-center">
                              <Thermometer className="h-4 w-4 mr-1 text-red-500" />
                              <span className="text-sm font-medium">{log.raw_data.ahtTemp.toFixed(1)}℃</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {log.raw_data?.ahtHum !== null && log.raw_data?.ahtHum !== undefined ? (
                            <div className="flex items-center justify-center">
                              <Droplets className="h-4 w-4 mr-1 text-blue-500" />
                              <span className="text-sm font-medium">{log.raw_data.ahtHum.toFixed(1)}%</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {log.raw_data?.bmpTemp !== null && log.raw_data?.bmpTemp !== undefined ? (
                            <div className="flex items-center justify-center">
                              <Thermometer className="h-4 w-4 mr-1 text-amber-500" />
                              <span className="text-sm font-medium">{log.raw_data.bmpTemp.toFixed(1)}℃</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {log.raw_data?.bmpPres !== null && log.raw_data?.bmpPres !== undefined ? (
                            <div className="flex items-center justify-center">
                              <Gauge className="h-4 w-4 mr-1 text-indigo-500" />
                              <span className="text-sm font-medium">{log.raw_data.bmpPres.toFixed(1)}hPa</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </AdminRoute>
  );
} 