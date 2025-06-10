// src/app/admin/sensors/page.tsx
'use client';

import { useState, useEffect } from 'react';
import supabase from '@/lib/supabaseBrowser';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, Activity, AlertTriangle, Filter, Building, Users, Settings, Info, Link } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatJSTDateTimeShort } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import AdminNavigation from '@/components/admin/AdminNavigation';

interface SensorDevice {
  id: string;
  device_name: string;
  ip_address: string | null;
  device_id?: string | null;
  location: string | null;
  last_seen: string | null;
  status: string | null;
  facilities: { name: string } | null;
  departments: { name: string } | null;
  facility_id: string | null;
  department_id: string | null;
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

export default function SensorManagement() {
  const router = useRouter();
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<Department[]>([]);
  
  // デバイス名候補リスト（Android OSスタイル）
  const deviceNames = [
    'Blizzard', 'Frost', 'Aurora', 'Nebula', 'Phoenix', 
    'Stellar', 'Comet', 'Galaxy', 'Nova', 'Pulsar',
    'Quasar', 'Horizon', 'Eclipse', 'Meteor', 'Zenith',
    'Cosmos', 'Orion', 'Polaris', 'Vega', 'Atlas'
  ];
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<SensorDevice | null>(null);
  
  // フィルタリング用のState
  const [selectedFacility, setSelectedFacility] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'facility' | 'department'>('facility');
  
  const [newDevice, setNewDevice] = useState({
    device_name: '',
    ip_address: '',
    device_id: '',
    location: '',
    facility_id: '',
    department_id: '',
  });
  
  // デバイス一覧の取得
  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('sensor_devices')
        .select(`
          id, 
          device_name, 
          ip_address,
          device_id,
          location, 
          last_seen, 
          status,
          facility_id,
          department_id,
          facilities(name),
          departments(name)
        `)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setDevices(data as unknown as SensorDevice[]);
      } else {
        console.error('デバイス取得エラー:', error);
      }
      
      // 施設一覧を取得
      const { data: facilityData, error: facilityError } = await supabase
        .from('facilities')
        .select('id, name')
        .order('name');
        
      if (!facilityError && facilityData) {
        setFacilities(facilityData);
      }
      
      // 部署一覧を取得（facility_idも含む）
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id, name, facility_id')
        .order('name');
        
      if (!deptError && deptData) {
        setDepartments(deptData as Department[]);
      }
      
      setLoading(false);
    };
    
    fetchDevices();
  }, []);
  
  // ランダムなデバイス名を生成
  const generateDeviceName = () => {
    const usedNames = devices.map(d => d.device_name);
    const availableNames = deviceNames.filter(name => !usedNames.some(used => used.includes(name)));
    
    if (availableNames.length > 0) {
      const randomName = availableNames[Math.floor(Math.random() * availableNames.length)];
      return `Temperature ${randomName}`;
    } else {
      // すべて使用済みの場合は番号を付ける
      const randomName = deviceNames[Math.floor(Math.random() * deviceNames.length)];
      const count = usedNames.filter(name => name.includes(randomName)).length;
      return `Temperature ${randomName} ${count + 1}`;
    }
  };
  
  // 施設選択時に部署をフィルタリング
  const handleFacilityChange = (facilityId: string, isEdit: boolean = false) => {
    const filtered = facilityId 
      ? departments.filter(dept => dept.facility_id === facilityId)
      : [];
    setFilteredDepartments(filtered);
    
    if (isEdit && currentDevice) {
      setCurrentDevice({
        ...currentDevice,
        facility_id: facilityId,
        department_id: null // 施設が変わったら部署をリセット
      });
    } else {
      setNewDevice(prev => ({
        ...prev,
        facility_id: facilityId,
        department_id: '' // 施設が変わったら部署をリセット
      }));
    }
  };
  
  // IPv6アドレスの正規化
  const normalizeIpAddress = (ip: string | null): string => {
    if (!ip) return '';
    // ::ffff: prefixを削除してIPv4アドレスのみを表示
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  };
  
  // 新しいデバイスを追加
  const handleAddDevice = async () => {
    try {
      const { data, error } = await supabase
        .from('sensor_devices')
        .insert({
          device_name: newDevice.device_name,
          ip_address: newDevice.ip_address,
          device_id: newDevice.device_id || null,
          location: newDevice.location,
          facility_id: newDevice.facility_id || null,
          department_id: newDevice.department_id || null,
          status: 'active'
        })
        .select();
        
      if (error) {
        console.error('デバイス追加エラー:', error);
        alert('デバイスの追加に失敗しました');
        return;
      }
      
      // 新しいデバイスを追加して画面を更新
      const newDeviceWithRefs = {
        ...data[0],
        facilities: newDevice.facility_id ? { name: facilities.find(f => f.id === newDevice.facility_id)?.name || '' } : null,
        departments: newDevice.department_id ? { name: departments.find(d => d.id === newDevice.department_id)?.name || '' } : null
      };
      
      setDevices([newDeviceWithRefs as SensorDevice, ...devices]);
      
      // フォームをリセット
      setNewDevice({
        device_name: '',
        ip_address: '',
        device_id: '',
        location: '',
        facility_id: '',
        department_id: '',
      });
      
      setShowAddForm(false);
    } catch (err) {
      console.error('処理エラー:', err);
      alert('エラーが発生しました');
    }
  };
  
  // デバイスを編集
  const handleEditDevice = async () => {
    if (!currentDevice) return;
    
    try {
      const { error } = await supabase
        .from('sensor_devices')
        .update({
          device_name: currentDevice.device_name,
          ip_address: currentDevice.ip_address,
          device_id: currentDevice.device_id || null,
          location: currentDevice.location,
          facility_id: currentDevice.facility_id,
          department_id: currentDevice.department_id,
        })
        .eq('id', currentDevice.id);
        
      if (error) {
        console.error('デバイス更新エラー:', error);
        alert('デバイスの更新に失敗しました');
        return;
      }
      
      // デバイス一覧を更新
      const updatedDevices = devices.map(device => 
        device.id === currentDevice.id 
          ? {
              ...currentDevice,
              facilities: currentDevice.facility_id 
                ? { name: facilities.find(f => f.id === currentDevice.facility_id)?.name || '' } 
                : null,
              departments: currentDevice.department_id 
                ? { name: departments.find(d => d.id === currentDevice.department_id)?.name || '' } 
                : null
            } 
          : device
      );
      
      setDevices(updatedDevices);
      setShowEditForm(false);
      setCurrentDevice(null);
    } catch (err) {
      console.error('処理エラー:', err);
      alert('エラーが発生しました');
    }
  };
  
  // デバイスを削除
  const handleDeleteDevice = async (id: string) => {
    if (!confirm('このデバイスを削除してもよろしいですか？')) return;
    
    try {
      const { error } = await supabase
        .from('sensor_devices')
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error('デバイス削除エラー:', error);
        alert('デバイスの削除に失敗しました');
        return;
      }
      
      // 削除したデバイスを一覧から除外
      setDevices(devices.filter(device => device.id !== id));
    } catch (err) {
      console.error('処理エラー:', err);
      alert('エラーが発生しました');
    }
  };

  // マッピング設定に遷移（デバイス情報を引き継ぎ）
  const handleGoToMapping = (device: SensorDevice) => {
    // デバイス情報をクエリパラメータとして渡す
    const params = new URLSearchParams({
      deviceId: device.id,
      deviceName: device.device_name,
      facilityId: device.facility_id || '',
      facilityName: device.facilities?.name || '',
      departmentName: device.departments?.name || ''
    });
    router.push(`/admin/sensor-mappings?${params.toString()}`);
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
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(device);
    });
    
    return Object.entries(groups).map(([group, devices]) => ({
      group,
      devices
    })).sort((a, b) => a.group.localeCompare(b.group));
  };
  
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto p-4">
        {/* header */}
        <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-lg p-6 shadow-sm">
          <h1 className="text-2xl font-bold mb-2 text-gray-800">センサーデバイス管理</h1>
          <p className="text-gray-600">センサーデバイスの登録・編集・削除を行います</p>
        </div>

        {/* admin navigation */}
        <AdminNavigation />

        {/* info card */}
        <Card className="mb-6 border-pink-200 bg-white shadow-sm">
          <CardHeader className="bg-gradient-to-r from-pink-50 to-purple-50">
            <CardTitle className="flex items-center">
              <Info className="mr-2 h-5 w-5 text-pink-600" />
              デバイス管理について
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                温度センサーデバイスの登録と管理を行います。デバイス名は自動生成することも可能です。
              </p>
              
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  推奨ワークフロー
                </h4>
                <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                  <li>ESPデバイスを起動してネットワークに接続</li>
                  <li>自動送信されたデバイス情報を確認・編集</li>
                  <li>「マッピング設定」ボタンで温度管理アイテムとの紐づけを実行</li>
                  <li>設定完了後、センサーモニタリング画面で動作確認</li>
                </ol>
                <p className="text-xs text-blue-600 mt-2">
                  ※ 1台ずつ設定することで、設定ミスを防げます
                </p>
              </div>
              
              {/* 新規デバイス登録ボタンをここに配置 */}
              <div className="pt-2 border-t border-pink-200">
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="bg-gradient-to-r from-pink-400 to-purple-500 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新規デバイス登録
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* フィルタリング・ソートコントロール */}
        <Card className="mb-6 border-pink-200 bg-white shadow-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
            <CardTitle className="flex items-center text-sm">
              <Filter className="mr-2 h-4 w-4 text-pink-600" />
              フィルター・表示設定
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 施設フィルター */}
              <div>
                <Label className="flex items-center mb-2">
                  <Building className="mr-1 h-4 w-4" />
                  施設
                </Label>
                <select
                  className="w-full p-2 border border-pink-200 rounded"
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
                <Label className="flex items-center mb-2">
                  <Users className="mr-1 h-4 w-4" />
                  部署
                </Label>
                <select
                  className="w-full p-2 border border-pink-200 rounded"
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

              {/* グループ化設定 */}
              <div>
                <Label className="flex items-center mb-2">
                  <Settings className="mr-1 h-4 w-4" />
                  グループ化
                </Label>
                <select
                  className="w-full p-2 border border-pink-200 rounded"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                >
                  <option value="facility">施設別</option>
                  <option value="department">部署別</option>
                  <option value="none">グループ化なし</option>
                </select>
              </div>
            </div>
            
            {/* 統計情報 */}
            <div className="mt-4 pt-4 border-t border-pink-200">
              <div className="flex items-center text-sm text-gray-600">
                <span>
                  表示中: {filteredDevices.length}件 / 総件数: {devices.length}件
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      
        {/* 新規デバイス追加フォーム */}
        {showAddForm && (
          <Card className="mb-6 border-pink-200 shadow-md bg-white">
            <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
              <CardTitle className="text-pink-800">新規センサーデバイス登録</CardTitle>
            </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="device_name">デバイス名</Label>
                <div className="flex gap-2">
                  <Input 
                    id="device_name" 
                    placeholder="デバイス名を入力"
                    value={newDevice.device_name}
                    onChange={(e) => setNewDevice({...newDevice, device_name: e.target.value})}
                    className="border-pink-200 flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => setNewDevice({...newDevice, device_name: generateDeviceName()})}
                    className="bg-purple-500 hover:bg-purple-600 text-white"
                    size="sm"
                  >
                    自動生成
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="ip_address">IPアドレス</Label>
                <Input 
                  id="ip_address" 
                  placeholder="例: 192.168.0.100"
                  value={newDevice.ip_address}
                  onChange={(e) => setNewDevice({...newDevice, ip_address: e.target.value})}
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="device_id">デバイスID (MACアドレス由来)</Label>
                <Input 
                  id="device_id" 
                  placeholder="例: 00:1A:2B:3C:4D:5E"
                  value={newDevice.device_id}
                  onChange={(e) => setNewDevice({...newDevice, device_id: e.target.value})}
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="facility">施設</Label>
                <select 
                  id="facility"
                  className="w-full p-2 border border-pink-200 rounded"
                  value={newDevice.facility_id}
                  onChange={(e) => handleFacilityChange(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {facilities.map(facility => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="department">部署</Label>
                <select 
                  id="department"
                  className="w-full p-2 border border-pink-200 rounded"
                  value={newDevice.department_id}
                  onChange={(e) => setNewDevice({...newDevice, department_id: e.target.value})}
                  disabled={!newDevice.facility_id}
                >
                  <option value="">
                    {newDevice.facility_id ? '選択してください' : '先に施設を選択してください'}
                  </option>
                  {filteredDepartments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="location">設置場所</Label>
                <Input 
                  id="location" 
                  placeholder="例: 会議室2F"
                  value={newDevice.location}
                  onChange={(e) => setNewDevice({...newDevice, location: e.target.value})}
                  onFocus={(e) => {
                    if (e.target.value === '未設定') {
                      setNewDevice({...newDevice, location: ''});
                    }
                  }}
                  className="border-pink-200"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowAddForm(false)}
                className="border-pink-200 text-pink-700"
              >
                キャンセル
              </Button>
              <Button 
                onClick={handleAddDevice}
                className="bg-gradient-to-r from-pink-400 to-purple-500 text-white"
                disabled={!newDevice.device_name || !newDevice.ip_address}
              >
                デバイスを登録
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
        {/* デバイス編集フォーム */}
        {showEditForm && currentDevice && (
          <Card className="mb-6 border-pink-200 shadow-md bg-white">
            <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
              <CardTitle className="text-pink-800">センサーデバイス編集</CardTitle>
            </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_device_name">デバイス名</Label>
                <div className="flex gap-2">
                  <Input 
                    id="edit_device_name" 
                    value={currentDevice.device_name}
                    onChange={(e) => setCurrentDevice({...currentDevice, device_name: e.target.value})}
                    className="border-pink-200 flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => setCurrentDevice({...currentDevice, device_name: generateDeviceName()})}
                    className="bg-purple-500 hover:bg-purple-600 text-white"
                    size="sm"
                  >
                    自動生成
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="edit_device_id">デバイスID (MACアドレス由来)</Label>
                <Input 
                  id="edit_device_id" 
                  value={currentDevice.device_id ?? ''}
                  onChange={(e) => setCurrentDevice({...currentDevice, device_id: e.target.value})}
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="edit_ip_address">IPアドレス</Label>
                <Input 
                  id="edit_ip_address" 
                  value={normalizeIpAddress(currentDevice.ip_address)}
                  onChange={(e) => setCurrentDevice({...currentDevice, ip_address: e.target.value})}
                  placeholder="例: 192.168.0.100"
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="edit_facility">施設</Label>
                <select 
                  id="edit_facility"
                  className="w-full p-2 border border-pink-200 rounded"
                  value={currentDevice.facility_id || ''}
                  onChange={(e) => handleFacilityChange(e.target.value, true)}
                >
                  <option value="">選択してください</option>
                  {facilities.map(facility => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="edit_department">部署</Label>
                <select 
                  id="edit_department"
                  className="w-full p-2 border border-pink-200 rounded"
                  value={currentDevice.department_id || ''}
                  onChange={(e) => setCurrentDevice({...currentDevice, department_id: e.target.value || null})}
                  disabled={!currentDevice.facility_id}
                >
                  <option value="">
                    {currentDevice.facility_id ? '選択してください' : '先に施設を選択してください'}
                  </option>
                  {(currentDevice.facility_id 
                    ? departments.filter(dept => dept.facility_id === currentDevice.facility_id)
                    : []
                  ).map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="edit_location">設置場所</Label>
                <Input 
                  id="edit_location" 
                  value={currentDevice.location ?? ''}
                  onChange={(e) => setCurrentDevice({...currentDevice, location: e.target.value})}
                  onFocus={(e) => {
                    if (e.target.value === '未設定') {
                      setCurrentDevice({...currentDevice, location: ''});
                    }
                  }}
                  placeholder="例: 会議室2F"
                  className="border-pink-200"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditForm(false);
                  setCurrentDevice(null);
                }}
                className="border-pink-200 text-pink-700"
              >
                キャンセル
              </Button>
              <Button 
                onClick={handleEditDevice}
                className="bg-gradient-to-r from-pink-400 to-purple-500 text-white"
              >
                更新
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
        {/* デバイス一覧 */}
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
            <p className="mt-2 text-gray-600">読み込み中...</p>
          </div>
        ) : devices.length === 0 ? (
          <Card className="border-pink-200 bg-white text-center py-8 shadow-sm">
            <CardContent>
              <AlertTriangle className="h-12 w-12 mx-auto text-pink-300 mb-2" />
              <p className="text-gray-600">登録されたデバイスがありません</p>
              <p className="text-sm text-gray-400 mt-1">
                上記の「新規デバイス登録」ボタンから追加してください
              </p>
            </CardContent>
          </Card>
        ) : filteredDevices.length === 0 ? (
          <Card className="border-pink-200 bg-white text-center py-8 shadow-sm">
            <CardContent>
              <Filter className="h-12 w-12 mx-auto text-pink-300 mb-2" />
              <p className="text-gray-600">選択された条件に一致するデバイスがありません</p>
              <p className="text-sm text-gray-400 mt-1">
                フィルター条件を変更してください
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groupedDevices().map((group, groupIdx) => (
              <div key={group.group}>
                {/* グループヘッダー */}
                {groupBy !== 'none' && (
                  <div className="flex items-center mb-4">
                    <div className="flex items-center">
                      {groupBy === 'facility' ? (
                        <Building className="h-5 w-5 text-pink-600 mr-2" />
                      ) : (
                        <Users className="h-5 w-5 text-pink-600 mr-2" />
                      )}
                      <h3 className="text-lg font-semibold text-gray-800">{group.group}</h3>
                      <span className="ml-2 px-2 py-1 bg-pink-100 text-pink-600 text-xs rounded-full">
                        {group.devices.length}件
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-pink-200 to-transparent ml-4"></div>
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
                      <Card className="border-pink-200 bg-white shadow-md hover:shadow-lg transition-shadow">
                        <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg pb-2">
                          <CardTitle className="flex items-center text-lg text-pink-800">
                            <Activity className="mr-2 h-5 w-5 text-pink-600" />
                            {device.device_name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">IPアドレス:</span>
                              <span className="text-sm">{normalizeIpAddress(device.ip_address)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">デバイスID:</span>
                              <span className="text-sm">{device.device_id || '未設定'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">施設:</span>
                              <span className="text-sm">{device.facilities?.name || '未設定'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">部署:</span>
                              <span className="text-sm">{device.departments?.name || '未設定'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">設置場所:</span>
                              <span className="text-sm">{device.location || '未設定'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">最終応答:</span>
                              <span className="text-sm">
                                {device.last_seen ? formatJSTDateTimeShort(device.last_seen) : '未応答'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-sm">ステータス:</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                device.status === 'active' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {device.status === 'active' ? '稼働中' : '停止中'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-pink-200">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleGoToMapping(device)}
                              className="border-purple-200 text-purple-700 hover:bg-purple-50"
                            >
                              <Link className="h-4 w-4 mr-1" />
                              マッピング設定
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setCurrentDevice(device);
                                // 編集時に現在の施設に対応する部署をフィルタリング
                                if (device.facility_id) {
                                  const filtered = departments.filter(dept => dept.facility_id === device.facility_id);
                                  setFilteredDepartments(filtered);
                                }
                                setShowEditForm(true);
                              }}
                              className="border-blue-200 text-blue-700 hover:bg-blue-50"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              編集
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleDeleteDevice(device.id)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              削除
                            </Button>
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
      </div>
    </div>
  );
} 