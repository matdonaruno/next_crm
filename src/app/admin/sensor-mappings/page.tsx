/* --------------------------------------------------------------------------
 * src/app/admin/sensor-mappings/page.tsx
 *  – Sensor ↔ Temperature-item mapping management (client component)
 *  – server-side : @supabase/ssr  ／ client-side : React helpers
 * ------------------------------------------------------------------------ */
'use client'

import { useEffect, useState } from 'react'
import supabase from '@/lib/supabaseBrowser'
import { useToast } from '@/hooks/use-toast'
import { useSearchParams } from 'next/navigation'
import AdminRoute from '@/components/auth/AdminRoute'
import AdminNavigation from '@/components/admin/AdminNavigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Save, Trash2, Info, Settings, Filter, Building, Users } from 'lucide-react'
import { motion } from 'framer-motion'

/* ----------------------------- 型定義 ---------------------------------- */
interface SensorDevice {
  id: string
  device_name: string
  facility_id: string | null
  facilities?: { name: string } | null
  departments?: { name: string } | null
}

interface TemperatureItem {
  id: string
  display_name: string | null
  department_id: string | null
  departments?: { 
    name: string
    facility_id: string | null
    facilities?: { name: string } | null
  } | null
}

interface SensorMapping {
  id: string
  sensor_device_id: string | null
  sensor_type: string
  temperature_item_id: string | null
  offset_value: number | null
  sensor_devices?: { 
    device_name: string
    facility_id: string | null
    facilities?: { name: string } | null
    departments?: { name: string } | null
  } | null
  temperature_items?: {
    display_name: string | null
    departments?: { 
      name: string
      facility_id: string | null
      facilities?: { name: string } | null
    } | null
  } | null
  isNew?: boolean
}

interface Facility {
  id: string
  name: string
}

interface Department {
  id: string
  name: string
  facility_id: string
}

/* --------------------------- 定数化 ----------------------------------- */
const SENSOR_TYPE_OPTIONS = [
  { value: 'ahtTemp', label: 'AHT20 温度' },
  { value: 'ahtHum',  label: 'AHT20 湿度' },
  { value: 'bmpTemp', label: 'BMP280 温度' },
  { value: 'bmpPres', label: 'BMP280 気圧' },
] as const;

/* ====================================================================== */
export default function SensorMappings() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [devices, setDevices] = useState<SensorDevice[]>([])
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([])
  const [mappings, setMappings] = useState<SensorMapping[]>([])
  const [loading, setLoading] = useState(true)
  
  // フィルタリング・ソート用のState
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedFacility, setSelectedFacility] = useState<string>('all')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [groupBy, setGroupBy] = useState<'none' | 'facility' | 'department'>('facility')
  
  // URL パラメータから取得したデバイス情報
  const preselectedDeviceId = searchParams?.get('deviceId')
  const preselectedDeviceName = searchParams?.get('deviceName')
  const preselectedFacilityName = searchParams?.get('facilityName')
  const preselectedDepartmentName = searchParams?.get('departmentName')

  /* ------------------ 初期データ取得 ------------------ */
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        /* 施設データ取得 */
        const { data: facilityData, error: facilityError } = await supabase
          .from('facilities')
          .select('id, name')
          .order('name')
        if (facilityError) console.error('施設取得エラー:', facilityError)
        else setFacilities(facilityData ?? [])

        /* 部署データ取得 */
        const { data: departmentData, error: departmentError } = await supabase
          .from('departments')
          .select('id, name, facility_id')
          .order('name')
        if (departmentError) console.error('部署取得エラー:', departmentError)
        else setDepartments(departmentData ?? [])

        /* デバイス */
        const { data: deviceData, error: deviceError } = await supabase
          .from('sensor_devices')
          .select(`
            id, 
            device_name, 
            facility_id,
            department_id,
            facilities(name),
            departments(name)
          `)
          .eq('status', 'active')
        if (deviceError) console.error('デバイス取得エラー:', deviceError)
        else setDevices(deviceData ?? [])

        /* 温度アイテム */
        const { data: itemData, error: itemError } = await supabase
          .from('temperature_items')
          .select(`
            id, 
            display_name, 
            department_id, 
            departments(
              name, 
              facility_id, 
              facilities(name)
            )
          `)
        if (itemError) console.error('温度アイテム取得エラー:', itemError)
        else {
          const formatted: TemperatureItem[] =
            itemData?.map((i) => ({
              id: i.id,
              display_name: i.display_name,
              department_id: i.department_id,
              departments: i.departments ?? null,
            })) ?? []
          setTemperatureItems(formatted)
        }

        /* 既存マッピング */
        const { data: mappingData, error: mappingError } = await supabase
          .from('sensor_mappings')
          .select(
            `
            id,
            sensor_device_id,
            sensor_devices(
              device_name,
              facility_id,
              facilities(name),
              departments(name)
            ),
            sensor_type,
            temperature_item_id,
            temperature_items(
              display_name, 
              departments(
                name,
                facility_id,
                facilities(name)
              )
            ),
            offset_value
          `,
          )
        
        console.log('[mapping] Loading mappings:', { mappingData, mappingError });
        
        if (mappingError) console.error('マッピング取得エラー:', mappingError)
        else {
          const formatted: SensorMapping[] =
            mappingData?.map((m) => ({
              id: m.id,
              sensor_device_id: m.sensor_device_id,
              sensor_type: m.sensor_type,
              temperature_item_id: m.temperature_item_id,
              offset_value: m.offset_value,
              sensor_devices: m.sensor_devices ?? null,
              temperature_items: m.temperature_items
                ? {
                    display_name: m.temperature_items.display_name,
                    departments: m.temperature_items.departments ?? null,
                  }
                : null,
            })) ?? []
          setMappings(formatted)

          // URLパラメータでデバイスが指定されている場合、自動的に新規マッピングを追加
          if (preselectedDeviceId) {
            // すでにこのデバイスのマッピングが存在しない場合のみ
            const existingMapping = formatted.find(m => m.sensor_device_id === preselectedDeviceId)
            if (!existingMapping) {
              setMappings(prev => [
                ...prev,
                {
                  id: `preselected-${Date.now()}`,
                  sensor_device_id: preselectedDeviceId,
                  sensor_type: 'ahtTemp', // デフォルト値
                  temperature_item_id: '',
                  offset_value: 0,
                  isNew: true,
                }
              ])
            }
          }
        }
      } catch (e) {
        console.error('データ取得エラー:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /* ---------------- マッピング追加 ---------------- */
  const addMapping = () =>
    setMappings((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        sensor_device_id: '',
        sensor_type: '',
        temperature_item_id: '',
        offset_value: 0,
        isNew: true,
      },
    ])

  /* ---------------- マッピング保存 / 更新 --------- */
  const saveMapping = async (mapping: SensorMapping, idx: number) => {
    if (!mapping.sensor_device_id || !mapping.sensor_type || !mapping.temperature_item_id) {
      toast({
        title: '必須項目が未入力です',
        variant: 'destructive',
      })
      return
    }
    try {
      if (mapping.isNew) {
        /* INSERT */
        console.log('[mapping] Inserting new mapping:', {
          sensor_device_id: mapping.sensor_device_id,
          sensor_type: mapping.sensor_type,
          temperature_item_id: mapping.temperature_item_id,
          offset_value: mapping.offset_value ?? 0,
        });
        
        const { data, error } = await supabase
          .from('sensor_mappings')
          .insert({
            sensor_device_id: mapping.sensor_device_id,
            sensor_type: mapping.sensor_type,
            temperature_item_id: mapping.temperature_item_id,
            offset_value: mapping.offset_value ?? 0,
          })
          .select(
            `
            id,
            sensor_device_id,
            sensor_devices(device_name),
            sensor_type,
            temperature_item_id,
            temperature_items(display_name, departments(name)),
            offset_value
          `,
          )
          .single()
        
        console.log('[mapping] Insert result:', { data, error });
        if (error) throw error

        const formatted: SensorMapping = {
          id: data.id,
          sensor_device_id: data.sensor_device_id,
          sensor_type: data.sensor_type,
          temperature_item_id: data.temperature_item_id,
          offset_value: data.offset_value,
          sensor_devices: data.sensor_devices ?? null,
          temperature_items: data.temperature_items
            ? {
                display_name: data.temperature_items.display_name,
                departments: data.temperature_items.departments ?? null,
              }
            : null,
          isNew: false,
        }
        setMappings((prev) => {
          const clone = [...prev]
          clone[idx] = formatted
          return clone
        })
      } else {
        /* UPDATE */
        const { error } = await supabase
          .from('sensor_mappings')
          .update({
            sensor_device_id: mapping.sensor_device_id,
            sensor_type: mapping.sensor_type,
            temperature_item_id: mapping.temperature_item_id,
            offset_value: mapping.offset_value ?? 0,
          })
          .eq('id', mapping.id)
        if (error) throw error
      }
      toast({
        title: '保存しました',
        description: 'マッピングが保存されました',
      })
    } catch (err) {
      console.error('保存エラー:', err)
      toast({
        title: '保存に失敗しました',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  /* ---------------- マッピング削除 ---------------- */
  const deleteMapping = async (id: string, idx: number) => {
    if (id.startsWith('new-')) {
      setMappings((prev) => prev.filter((_, i) => i !== idx))
      return
    }
    if (!confirm('このマッピングを削除しますか？')) return
    try {
      const { error } = await supabase.from('sensor_mappings').delete().eq('id', id)
      if (error) throw error
      setMappings((prev) => prev.filter((m) => m.id !== id))
      toast({
        title: '削除しました',
        description: 'マッピングを削除しました',
      })
    } catch (err) {
      console.error('削除エラー:', err)
      toast({
        title: '削除に失敗しました',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  /* ---------------- フィルタリング・グループ化 ------------ */
  const filteredMappings = mappings.filter((mapping) => {
    // 施設フィルター
    if (selectedFacility !== 'all') {
      const facilityId = mapping.sensor_devices?.facility_id || 
                        mapping.temperature_items?.departments?.facility_id
      if (facilityId !== selectedFacility) return false
    }
    
    // 部署フィルター
    if (selectedDepartment !== 'all') {
      const deviceDepartment = mapping.sensor_devices?.departments?.name
      const itemDepartment = mapping.temperature_items?.departments?.name
      if (deviceDepartment !== selectedDepartment && itemDepartment !== selectedDepartment) {
        return false
      }
    }
    
    return true
  })

  const groupedMappings = () => {
    if (groupBy === 'none') {
      return [{ group: 'すべて', mappings: filteredMappings }]
    }
    
    const groups: { [key: string]: SensorMapping[] } = {}
    
    filteredMappings.forEach((mapping) => {
      let groupKey = 'その他'
      
      if (groupBy === 'facility') {
        const facilityName = mapping.sensor_devices?.facilities?.name || 
                           mapping.temperature_items?.departments?.facilities?.name
        groupKey = facilityName || 'その他'
      } else if (groupBy === 'department') {
        const departmentName = mapping.sensor_devices?.departments?.name || 
                             mapping.temperature_items?.departments?.name
        groupKey = departmentName || 'その他'
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(mapping)
    })
    
    return Object.entries(groups).map(([group, mappings]) => ({
      group,
      mappings
    })).sort((a, b) => a.group.localeCompare(b.group))
  }

  /* ---------------- ローカル state 編集 ------------ */
  const updateMapping = (idx: number, field: keyof SensorMapping, val: any) =>
    setMappings((prev) => {
      const clone = [...prev]
      clone[idx] = { ...clone[idx], [field]: val }
      return clone
    })

  /* ---------------- マッピングの保存可否判定 ------------ */
  const canSaveMapping = (mapping: SensorMapping): boolean => {
    // 新規マッピングの場合：必須項目がすべて入力されているかチェック
    if (mapping.isNew) {
      return !!(mapping.sensor_device_id && mapping.sensor_type && mapping.temperature_item_id)
    }
    // 既存マッピングの場合：変更があるかチェック（実装するなら元の値と比較が必要）
    // 今回は既存マッピングは常に保存可能とする
    return true
  }

  /* ---------------- 新規追加されたマッピングかチェック ------------ */
  const isPreselectedMapping = (mapping: SensorMapping): boolean => {
    return mapping.isNew && mapping.sensor_device_id === preselectedDeviceId
  }

  /* --------------------------- UI --------------------------- */
  return (
    <AdminRoute requiredRole="admin">
      <div className="min-h-screen bg-white">
        <div className="container mx-auto p-4">
          {/* header */}
          <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-lg p-6 shadow-sm">
            <h1 className="text-2xl font-bold mb-2 text-gray-800">センサーマッピング設定</h1>
            <p className="text-gray-600">センサーデバイスと温度管理アイテムの紐づけを管理します</p>
          </div>

          {/* admin navigation */}
          <AdminNavigation />
          
          {/* 事前選択されたデバイス情報の表示 */}
          {preselectedDeviceId && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Info className="h-5 w-5 text-purple-600 mr-2" />
                <span className="font-semibold text-purple-800">選択されたデバイス</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">デバイス名: </span>
                  <span className="font-medium">{preselectedDeviceName}</span>
                </div>
                {preselectedFacilityName && (
                  <div>
                    <span className="text-gray-600">施設: </span>
                    <span className="font-medium">{preselectedFacilityName}</span>
                  </div>
                )}
                {preselectedDepartmentName && (
                  <div>
                    <span className="text-gray-600">部署: </span>
                    <span className="font-medium">{preselectedDepartmentName}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-purple-600 mt-2">
                このデバイス用の新しいマッピングが自動的に追加されました。下記で設定を完了してください。
              </p>
            </div>
          )}

          {/* info card */}
          <Card className="mb-6 border-purple-200 bg-white shadow-sm">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100">
              <CardTitle className="flex items-center">
                <Info className="mr-2 h-5 w-5 text-purple-600" />
                センサータイプについて
              </CardTitle>
              <CardDescription>
                センサーから取得したデータと温度管理アイテムを紐づけます
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>ahtTemp : AHT20 温度（℃）</li>
                <li>ahtHum  : AHT20 湿度（%）</li>
                <li>bmpTemp : BMP280 温度（℃）</li>
                <li>bmpPres : BMP280 気圧（hPa）</li>
              </ul>
              
              {/* 新規マッピングボタンをここに配置 */}
              <div className="mt-4 pt-4 border-t border-purple-200">
                <Button
                  onClick={addMapping}
                  className="bg-gradient-to-r from-purple-400 to-purple-600 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新規マッピング追加
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* フィルタリング・ソートコントロール */}
          <Card className="mb-6 border-purple-200 bg-white shadow-sm">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
              <CardTitle className="flex items-center text-sm">
                <Filter className="mr-2 h-4 w-4 text-purple-600" />
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
                    className="w-full p-2 border border-purple-200 rounded"
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
                    className="w-full p-2 border border-purple-200 rounded"
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
                    className="w-full p-2 border border-purple-200 rounded"
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
              <div className="mt-4 pt-4 border-t border-purple-200">
                <div className="flex items-center text-sm text-gray-600">
                  <span>
                    表示中: {filteredMappings.length}件 / 総件数: {mappings.length}件
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* マッピングリスト */}
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
              <p className="mt-2 text-gray-600">読み込み中...</p>
            </div>
          ) : mappings.length === 0 ? (
            <Card className="border-purple-200 bg-white text-center py-8 shadow-sm">
              <CardContent>
                <Settings className="h-12 w-12 mx-auto text-pink-300 mb-2" />
                <p className="text-gray-600">マッピングがありません</p>
                <p className="text-sm text-gray-400 mt-1">
                  上記の「新規マッピング追加」ボタンから追加してください
                </p>
              </CardContent>
            </Card>
          ) : filteredMappings.length === 0 ? (
            <Card className="border-purple-200 bg-white text-center py-8 shadow-sm">
              <CardContent>
                <Filter className="h-12 w-12 mx-auto text-pink-300 mb-2" />
                <p className="text-gray-600">選択された条件に一致するマッピングがありません</p>
                <p className="text-sm text-gray-400 mt-1">
                  フィルター条件を変更してください
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {groupedMappings().map((group, groupIdx) => (
                <div key={group.group}>
                  {/* グループヘッダー */}
                  {groupBy !== 'none' && (
                    <div className="flex items-center mb-4">
                      <div className="flex items-center">
                        {groupBy === 'facility' ? (
                          <Building className="h-5 w-5 text-purple-600 mr-2" />
                        ) : (
                          <Users className="h-5 w-5 text-purple-600 mr-2" />
                        )}
                        <h3 className="text-lg font-semibold text-gray-800">{group.group}</h3>
                        <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded-full">
                          {group.mappings.length}件
                        </span>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-purple-200 to-transparent ml-4"></div>
                    </div>
                  )}

                  {/* マッピングカード */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {group.mappings.map((m, idx) => {
                      const originalIdx = mappings.findIndex(mapping => mapping.id === m.id)
                      const isPreselected = isPreselectedMapping(m)
                      const canSave = canSaveMapping(m)
                      
                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: (groupIdx * group.mappings.length + idx) * 0.05 }}
                        >
                          <Card className={`border-purple-200 bg-white hover:shadow-lg transition-shadow ${
                            isPreselected ? 'ring-2 ring-purple-300 border-purple-300' : ''
                          }`}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center flex-1">
                                  <div className={`w-3 h-3 rounded-full mr-2 ${
                                    isPreselected 
                                      ? 'bg-gradient-to-r from-purple-400 to-purple-600 animate-pulse' 
                                      : 'bg-gradient-to-r from-purple-400 to-purple-500'
                                  }`}></div>
                                  <span className="font-medium text-gray-800">
                                    {SENSOR_TYPE_OPTIONS.find(opt => opt.value === m.sensor_type)?.label || m.sensor_type}
                                  </span>
                                  {isPreselected && (
                                    <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                                      新規設定中
                                    </span>
                                  )}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteMapping(m.id, originalIdx)}
                                  className="text-red-600 border-red-200 hover:bg-red-50 ml-auto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-4">
                            {/* センサーデバイス */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700">センサーデバイス</Label>
                              <select
                                className="w-full mt-1 p-2 border border-purple-200 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={m.sensor_device_id ?? ''}
                                onChange={(e) => updateMapping(originalIdx, 'sensor_device_id', e.target.value)}
                              >
                                <option value="">選択してください</option>
                                {devices.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.device_name}
                                    {d.facilities?.name && ` (${d.facilities.name})`}
                                    {d.departments?.name && ` - ${d.departments.name}`}
                                  </option>
                                ))}
                              </select>
                              {/* デバイス詳細情報 */}
                              {m.sensor_devices && (
                                <div className="mt-2 text-xs text-gray-500">
                                  {m.sensor_devices.facilities?.name && (
                                    <span className="inline-flex items-center mr-3">
                                      <Building className="w-3 h-3 mr-1" />
                                      {m.sensor_devices.facilities.name}
                                    </span>
                                  )}
                                  {m.sensor_devices.departments?.name && (
                                    <span className="inline-flex items-center">
                                      <Users className="w-3 h-3 mr-1" />
                                      {m.sensor_devices.departments.name}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* センサータイプ */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700">センサータイプ</Label>
                              <select
                                className="w-full mt-1 p-2 border border-purple-200 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={m.sensor_type}
                                onChange={(e) => updateMapping(originalIdx, 'sensor_type', e.target.value)}
                              >
                                {SENSOR_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 温度アイテム */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700">温度管理アイテム</Label>
                              <select
                                className="w-full mt-1 p-2 border border-purple-200 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={m.temperature_item_id ?? ''}
                                onChange={(e) => updateMapping(originalIdx, 'temperature_item_id', e.target.value)}
                              >
                                <option value="">選択してください</option>
                                {temperatureItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.display_name}
                                    {item.departments?.facilities?.name && ` (${item.departments.facilities.name})`}
                                    {item.departments?.name && ` - ${item.departments.name}`}
                                  </option>
                                ))}
                              </select>
                              {/* アイテム詳細情報 */}
                              {m.temperature_items && (
                                <div className="mt-2 text-xs text-gray-500">
                                  {m.temperature_items.departments?.facilities?.name && (
                                    <span className="inline-flex items-center mr-3">
                                      <Building className="w-3 h-3 mr-1" />
                                      {m.temperature_items.departments.facilities.name}
                                    </span>
                                  )}
                                  {m.temperature_items.departments?.name && (
                                    <span className="inline-flex items-center">
                                      <Users className="w-3 h-3 mr-1" />
                                      {m.temperature_items.departments.name}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* オフセット値 */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700">
                                オフセット値
                                <span className="text-xs text-gray-500 ml-1">
                                  (センサー値に加算される調整値)
                                </span>
                              </Label>
                              <Input
                                type="number"
                                step="0.1"
                                className="mt-1 border-purple-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={m.offset_value ?? 0}
                                onChange={(e) => updateMapping(originalIdx, 'offset_value', parseFloat(e.target.value) || 0)}
                              />
                            </div>

                            {/* 保存ボタン */}
                            <div className="pt-2 border-t border-purple-200">
                              <Button
                                onClick={() => saveMapping(m, originalIdx)}
                                disabled={!canSave}
                                className={`w-full transition-all ${
                                  canSave
                                    ? isPreselected
                                      ? 'bg-gradient-to-r from-purple-400 to-purple-600 text-white hover:from-purple-500 hover:to-purple-700 ring-2 ring-purple-300'
                                      : 'bg-gradient-to-r from-purple-400 to-purple-500 text-white hover:from-pink-500 hover:to-purple-600'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed hover:bg-gray-200'
                                }`}
                              >
                                <Save className={`mr-2 h-4 w-4 ${canSave ? '' : 'opacity-50'}`} />
                                {isPreselected && canSave ? '設定を完了' : canSave ? '保存' : '入力が必要'}
                              </Button>
                              {isPreselected && !canSave && (
                                <p className="text-xs text-purple-600 mt-2 text-center">
                                  ↑ センサータイプと温度管理アイテムを選択してください
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminRoute>
  )
}
