'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Save, Trash2, Info, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

interface SensorDevice {
  id: string;
  device_name: string;
}

interface TemperatureItem {
  id: string;
  display_name: string;
  department_id?: string;
  departments?: { name: string };
}

interface SensorMapping {
  id: string;
  sensor_device_id: string;
  sensor_type: string;
  temperature_item_id: string;
  offset_value: number;
  sensor_devices?: { device_name: string };
  temperature_items?: { display_name: string; departments?: { name: string } };
  isNew?: boolean;
}

export default function SensorMappings() {
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [mappings, setMappings] = useState<SensorMapping[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        // デバイス一覧を取得
        const { data: deviceData, error: deviceError } = await supabase
          .from('sensor_devices')
          .select('id, device_name')
          .eq('status', 'active');
          
        if (deviceError) {
          console.error('デバイス取得エラー:', deviceError);
        } else if (deviceData) {
          setDevices(deviceData);
        }
        
        // 温度アイテム一覧を取得
        const { data: itemData, error: itemError } = await supabase
          .from('temperature_items')
          .select('id, display_name, department_id, departments(name)');
          
        if (itemError) {
          console.error('温度アイテム取得エラー:', itemError);
        } else if (itemData) {
          // データ形式を修正して設定
          const formattedItems = itemData.map((item: any) => ({
            id: item.id,
            display_name: item.display_name,
            department_id: item.department_id,
            departments: item.departments
          })) as TemperatureItem[];
          setTemperatureItems(formattedItems);
        }
        
        // 既存のマッピングを取得
        const { data: mappingData, error: mappingError } = await supabase
          .from('sensor_mappings')
          .select(`
            id,
            sensor_device_id,
            sensor_devices(device_name),
            sensor_type,
            temperature_item_id,
            temperature_items(display_name, departments(name)),
            offset_value
          `);
          
        if (mappingError) {
          console.error('マッピング取得エラー:', mappingError);
        } else if (mappingData) {
          // データ形式を修正して設定
          const formattedMappings = mappingData.map((mapping: any) => ({
            id: mapping.id,
            sensor_device_id: mapping.sensor_device_id,
            sensor_type: mapping.sensor_type,
            temperature_item_id: mapping.temperature_item_id,
            offset_value: mapping.offset_value,
            sensor_devices: mapping.sensor_devices?.[0] || { device_name: '' },
            temperature_items: {
              display_name: mapping.temperature_items?.[0]?.display_name || '',
              departments: mapping.temperature_items?.[0]?.departments?.[0] || { name: '' }
            }
          })) as SensorMapping[];
          setMappings(formattedMappings);
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // 新しいマッピングを追加
  const addMapping = () => {
    setMappings([
      ...mappings,
      {
        id: `new-${Date.now()}`,
        sensor_device_id: '',
        sensor_type: '',
        temperature_item_id: '',
        offset_value: 0,
        isNew: true
      }
    ]);
  };
  
  // マッピングの保存
  const saveMapping = async (mapping: SensorMapping, index: number) => {
    if (!mapping.sensor_device_id || !mapping.sensor_type || !mapping.temperature_item_id) {
      alert('必須項目を入力してください');
      return;
    }
    
    try {
      if (mapping.isNew) {
        // 新規マッピングを保存
        const { data, error } = await supabase
          .from('sensor_mappings')
          .insert({
            sensor_device_id: mapping.sensor_device_id,
            sensor_type: mapping.sensor_type,
            temperature_item_id: mapping.temperature_item_id,
            offset_value: mapping.offset_value || 0
          })
          .select(`
            id,
            sensor_device_id,
            sensor_devices(device_name),
            sensor_type,
            temperature_item_id,
            temperature_items(display_name, departments(name)),
            offset_value
          `)
          .single();
          
        if (error) {
          console.error('マッピング保存エラー:', error);
          alert('マッピングの保存に失敗しました');
          return;
        }
        
        // 取得したデータを正しい形式に変換
        const formattedData = {
          ...data,
          sensor_devices: data.sensor_devices?.[0] || { device_name: '' },
          temperature_items: {
            display_name: data.temperature_items?.[0]?.display_name || '',
            departments: data.temperature_items?.[0]?.departments?.[0] || { name: '' }
          }
        } as SensorMapping;
        
        // マッピング一覧を更新
        const updatedMappings = [...mappings];
        updatedMappings[index] = formattedData;
        setMappings(updatedMappings);
        
        alert('マッピングが保存されました');
      } else {
        // 既存マッピングの更新
        const { error } = await supabase
          .from('sensor_mappings')
          .update({
            sensor_device_id: mapping.sensor_device_id,
            sensor_type: mapping.sensor_type,
            temperature_item_id: mapping.temperature_item_id,
            offset_value: mapping.offset_value || 0
          })
          .eq('id', mapping.id);
          
        if (error) {
          console.error('マッピング更新エラー:', error);
          alert('マッピングの更新に失敗しました');
          return;
        }
        
        alert('マッピングが更新されました');
      }
    } catch (error) {
      console.error('処理エラー:', error);
      alert('エラーが発生しました');
    }
  };
  
  // マッピングの削除
  const deleteMapping = async (id: string, index: number) => {
    if (id.startsWith('new-')) {
      // 未保存の場合は単に配列から削除
      const updatedMappings = [...mappings];
      updatedMappings.splice(index, 1);
      setMappings(updatedMappings);
      return;
    }
    
    if (!confirm('このマッピングを削除してもよろしいですか？')) return;
    
    try {
      const { error } = await supabase
        .from('sensor_mappings')
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error('マッピング削除エラー:', error);
        alert('マッピングの削除に失敗しました');
        return;
      }
      
      // 削除したマッピングを一覧から除外
      const updatedMappings = [...mappings];
      updatedMappings.splice(index, 1);
      setMappings(updatedMappings);
      
      alert('マッピングが削除されました');
    } catch (error) {
      console.error('処理エラー:', error);
      alert('エラーが発生しました');
    }
  };
  
  // マッピング情報の更新
  const updateMapping = (index: number, field: string, value: string | number) => {
    const updatedMappings = [...mappings];
    updatedMappings[index] = {
      ...updatedMappings[index],
      [field]: value
    };
    setMappings(updatedMappings);
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">センサーマッピング設定</h1>
        <Button 
          onClick={addMapping} 
          className="bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          新規マッピング追加
        </Button>
      </div>
      
      <Card className="mb-6 border-pink-200">
        <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100">
          <CardTitle className="flex items-center">
            <Info className="mr-2 h-5 w-5 text-pink-600" />
            センサータイプについて
          </CardTitle>
          <CardDescription>
            センサーからのデータと温度管理アイテムを紐づけます
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>ahtTemp</strong>: AHT20センサーの温度値（℃）</li>
            <li><strong>ahtHum</strong>: AHT20センサーの湿度値（%）</li>
            <li><strong>bmpTemp</strong>: BMP280センサーの温度値（℃）</li>
            <li><strong>bmpPres</strong>: BMP280センサーの気圧値（hPa）</li>
          </ul>
          <p className="mt-2 text-sm text-gray-500">
            オフセット値は測定値の補正に使用されます。例えば、センサーが実際より0.5℃低く表示される場合は、オフセット値を0.5に設定してください。
          </p>
        </CardContent>
      </Card>
      
      {loading ? (
        <div className="text-center py-8">
          <div className="spinner"></div>
          <p className="mt-2 text-gray-500">マッピング情報を読み込み中...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {mappings.length === 0 ? (
            <Card className="border-pink-200 text-center py-8">
              <CardContent>
                <Settings className="h-12 w-12 mx-auto text-pink-300 mb-2" />
                <p className="text-gray-500">マッピングが設定されていません</p>
                <Button 
                  onClick={addMapping} 
                  className="mt-4 bg-gradient-to-r from-pink-400 to-purple-500 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新規マッピング追加
                </Button>
              </CardContent>
            </Card>
          ) : (
            mappings.map((mapping, index) => (
              <motion.div
                key={mapping.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card key={mapping.id} className="border-pink-200">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <Label>センサーデバイス</Label>
                        <select 
                          className="w-full p-2 border border-pink-200 rounded"
                          value={mapping.sensor_device_id}
                          onChange={(e) => updateMapping(index, 'sensor_device_id', e.target.value)}
                        >
                          <option value="">選択してください</option>
                          {devices.map(device => (
                            <option key={device.id} value={device.id}>
                              {device.device_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <Label>センサータイプ</Label>
                        <select 
                          className="w-full p-2 border border-pink-200 rounded"
                          value={mapping.sensor_type}
                          onChange={(e) => updateMapping(index, 'sensor_type', e.target.value)}
                        >
                          <option value="">選択してください</option>
                          <option value="ahtTemp">AHT20 温度</option>
                          <option value="ahtHum">AHT20 湿度</option>
                          <option value="bmpTemp">BMP280 温度</option>
                          <option value="bmpPres">BMP280 気圧</option>
                        </select>
                      </div>
                      
                      <div>
                        <Label>温度管理アイテム</Label>
                        <select 
                          className="w-full p-2 border border-pink-200 rounded"
                          value={mapping.temperature_item_id}
                          onChange={(e) => updateMapping(index, 'temperature_item_id', e.target.value)}
                        >
                          <option value="">選択してください</option>
                          {temperatureItems.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.display_name} ({item.departments?.name || '不明'})
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <Label>オフセット値</Label>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={mapping.offset_value || 0}
                          onChange={(e) => updateMapping(index, 'offset_value', parseFloat(e.target.value))}
                          className="border-pink-200"
                        />
                      </div>
                      
                      <div className="flex items-end space-x-2">
                        <Button 
                          variant="outline" 
                          onClick={() => saveMapping(mapping, index)}
                          className="flex-1 border-green-200 text-green-700"
                        >
                          <Save className="h-4 w-4 mr-1" />
                          保存
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => deleteMapping(mapping.id, index)}
                          className="flex-1 border-red-200 text-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          削除
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
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