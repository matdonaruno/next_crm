'use client';

import { useState, useEffect } from 'react';
import supabase from '@/lib/supabaseClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, Activity, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

interface SensorDevice {
  id: string;
  device_name: string;
  ip_address: string;
  device_id?: string;
  location: string;
  last_seen: string | null;
  status: string;
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
}

export default function SensorManagement() {
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<SensorDevice | null>(null);
  
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
      
      // 部署一覧を取得
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');
        
      if (!deptError && deptData) {
        setDepartments(deptData);
      }
      
      setLoading(false);
    };
    
    fetchDevices();
  }, []);
  
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
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">センサーデバイス管理</h1>
        <Button 
          onClick={() => setShowAddForm(true)} 
          className="bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          新規デバイス登録
        </Button>
      </div>
      
      {/* 新規デバイス追加フォーム */}
      {showAddForm && (
        <Card className="mb-6 border-pink-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
            <CardTitle className="text-pink-800">新規センサーデバイス登録</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="device_name">デバイス名</Label>
                <Input 
                  id="device_name" 
                  placeholder="デバイス名を入力"
                  value={newDevice.device_name}
                  onChange={(e) => setNewDevice({...newDevice, device_name: e.target.value})}
                  className="border-pink-200"
                />
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
                  onChange={(e) => setNewDevice({...newDevice, facility_id: e.target.value})}
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
                >
                  <option value="">選択してください</option>
                  {departments.map(dept => (
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
        <Card className="mb-6 border-pink-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
            <CardTitle className="text-pink-800">センサーデバイス編集</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_device_name">デバイス名</Label>
                <Input 
                  id="edit_device_name" 
                  value={currentDevice.device_name}
                  onChange={(e) => setCurrentDevice({...currentDevice, device_name: e.target.value})}
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="edit_device_id">デバイスID (MACアドレス由来)</Label>
                <Input 
                  id="edit_device_id" 
                  value={currentDevice.device_id || ''}
                  onChange={(e) => setCurrentDevice({...currentDevice, device_id: e.target.value})}
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="edit_ip_address">IPアドレス</Label>
                <Input 
                  id="edit_ip_address" 
                  value={currentDevice.ip_address}
                  onChange={(e) => setCurrentDevice({...currentDevice, ip_address: e.target.value})}
                  className="border-pink-200"
                />
              </div>
              
              <div>
                <Label htmlFor="edit_facility">施設</Label>
                <select 
                  id="edit_facility"
                  className="w-full p-2 border border-pink-200 rounded"
                  value={currentDevice.facility_id || ''}
                  onChange={(e) => setCurrentDevice({...currentDevice, facility_id: e.target.value || null})}
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
                >
                  <option value="">選択してください</option>
                  {departments.map(dept => (
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
                  value={currentDevice.location || ''}
                  onChange={(e) => setCurrentDevice({...currentDevice, location: e.target.value})}
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
          <div className="spinner"></div>
          <p className="mt-2 text-gray-500">デバイス情報を読み込み中...</p>
        </div>
      ) : devices.length === 0 ? (
        <Card className="border-pink-200 text-center py-8">
          <CardContent>
            <AlertTriangle className="h-12 w-12 mx-auto text-pink-300 mb-2" />
            <p className="text-gray-500">登録されたデバイスがありません</p>
            <Button 
              onClick={() => setShowAddForm(true)} 
              className="mt-4 bg-gradient-to-r from-pink-400 to-purple-500 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              新規デバイス登録
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map(device => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-pink-200 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg pb-2">
                  <CardTitle className="flex items-center text-lg text-pink-800">
                    <Activity className="mr-2 h-5 w-5 text-pink-600" />
                    {device.device_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
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
                      <span className="text-gray-500">設置場所:</span>
                      <span>{device.location || '未設定'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">最終応答:</span>
                      <span>
                        {device.last_seen 
                          ? new Date(device.last_seen).toLocaleString() 
                          : '未応答'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">ステータス:</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        device.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {device.status === 'active' ? '稼働中' : '停止中'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-2 mt-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setCurrentDevice(device);
                        setShowEditForm(true);
                      }}
                      className="border-blue-200 text-blue-700"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      編集
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDeleteDevice(device.id)}
                      className="text-red-600 border-red-200"
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
      )}
      
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