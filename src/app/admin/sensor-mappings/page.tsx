/* --------------------------------------------------------------------------
 * src/app/admin/sensor-mappings/page.tsx
 *  – Sensor ↔ Temperature-item mapping management (client component)
 *  – server-side : @supabase/ssr  ／ client-side : React helpers
 * ------------------------------------------------------------------------ */
'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/app/_providers/supabase-provider'
import { useToast } from '@/hooks/use-toast'
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
import { Plus, Save, Trash2, Info, Settings } from 'lucide-react'
import { motion } from 'framer-motion'

/* ----------------------------- 型定義 ---------------------------------- */
interface SensorDevice {
  id: string
  device_name: string
}

interface TemperatureItem {
  id: string
  /** DB が NULL を返し得るので null 許容 */
  display_name: string | null
  department_id: string | null
  departments?: { name: string } | null
}

interface SensorMapping {
  id: string
  /** ここも null が返る事がある */
  sensor_device_id: string | null
  sensor_type: string
  temperature_item_id: string | null
  offset_value: number | null
  sensor_devices?: { device_name: string } | null
  temperature_items?: {
    display_name: string | null
    departments?: { name: string } | null
  } | null
  isNew?: boolean
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
  const { supabase } = useSupabase();          // ← 新規
  const { toast } = useToast();
  const [devices, setDevices] = useState<SensorDevice[]>([])
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([])
  const [mappings, setMappings] = useState<SensorMapping[]>([])
  const [loading, setLoading] = useState(true)

  /* ------------------ 初期データ取得 ------------------ */
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        /* デバイス */
        const { data: deviceData, error: deviceError } = await supabase
          .from('sensor_devices')
          .select('id, device_name')
          .eq('status', 'active')
        if (deviceError) console.error('デバイス取得エラー:', deviceError)
        else setDevices(deviceData ?? [])

        /* 温度アイテム */
        const { data: itemData, error: itemError } = await supabase
          .from('temperature_items')
          .select('id, display_name, department_id, departments(name)')
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
            sensor_devices(device_name),
            sensor_type,
            temperature_item_id,
            temperature_items(display_name, departments(name)),
            offset_value
          `,
          )
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

  /* ---------------- ローカル state 編集 ------------ */
  const updateMapping = (idx: number, field: keyof SensorMapping, val: any) =>
    setMappings((prev) => {
      const clone = [...prev]
      clone[idx] = { ...clone[idx], [field]: val }
      return clone
    })

  /* --------------------------- UI --------------------------- */
  return (
    <div className="container mx-auto p-4">
      {/* header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">センサーマッピング設定</h1>
        <Button
          onClick={addMapping}
          className="bg-gradient-to-r from-pink-400 to-purple-500 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          新規マッピング追加
        </Button>
      </div>

      {/* info card */}
      <Card className="mb-6 border-pink-200">
        <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100">
          <CardTitle className="flex items-center">
            <Info className="mr-2 h-5 w-5 text-pink-600" />
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
        </CardContent>
      </Card>

      {/* list */}
      {loading ? (
        <p className="text-center py-8">読み込み中...</p>
      ) : mappings.length === 0 ? (
        <Card className="border-pink-200 text-center py-8">
          <CardContent>
            <Settings className="h-12 w-12 mx-auto text-pink-300 mb-2" />
            <p className="text-gray-500">マッピングがありません</p>
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
        <div className="space-y-4">
          {mappings.map((m, idx) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <Card className="border-pink-200">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* device */}
                    <div>
                      <Label>センサーデバイス</Label>
                      <select
                        className="w-full p-2 border border-pink-200 rounded"
                        value={m.sensor_device_id ?? ''}
                        onChange={(e) =>
                          updateMapping(idx, 'sensor_device_id', e.target.value)
                        }
                      >
                        <option value="">選択してください</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.device_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* type */}
                    <div>
                      <Label>センサータイプ</Label>
                      <select
                        className="w-full p-2 border border-pink-200 rounded"
                        value={m.sensor_type}
                        onChange={(e) =>
                          updateMapping(idx, 'sensor_type', e.target.value)
                        }
                      >
                        <option value="">選択してください</option>
                        {SENSOR_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* temperature item */}
                    <div>
                      <Label>温度管理アイテム</Label>
                      <select
                        className="w-full p-2 border border-pink-200 rounded"
                        value={m.temperature_item_id ?? ''}
                        onChange={(e) =>
                          updateMapping(idx, 'temperature_item_id', e.target.value)
                        }
                      >
                        <option value="">選択してください</option>
                        {temperatureItems.map((t) => (
                          <option key={t.id} value={t.id}>
                            {`${t.display_name ?? '名称未設定'}（${t.departments?.name ?? '不明'}）`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* offset */}
                    <div>
                      <Label>オフセット値</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={m.offset_value ?? 0}
                        onChange={(e) =>
                          updateMapping(
                            idx,
                            'offset_value',
                            Number.isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value)
                          )
                        }
                        className="border-pink-200"
                      />
                    </div>

                    {/* actions */}
                    <div className="flex items-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => saveMapping(m, idx)}
                        className="flex-1 border-green-200 text-green-700"
                      >
                        <Save className="h-4 w-4 mr-1" />
                        保存
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteMapping(m.id, idx)}
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
          ))}
        </div>
      )}
    </div>
  )
}
