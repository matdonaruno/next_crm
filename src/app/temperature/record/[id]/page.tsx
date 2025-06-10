// src/app/temperature/record/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Save,
  Trash2,
  Edit,
  AlertCircle,
  Activity,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import supabase from '@/lib/supabaseBrowser';
import { useSimpleAuth } from '@/hooks/useSimpleAuth';
import { useSessionCheck } from '@/hooks/useSessionCheck';
import { formatJSTDate } from '@/lib/utils';

/* ───────── 型定義 ───────── */
interface TemperatureRecordDetail {
  id: string;
  temperature_item_id: string;
  value: number;
  data_source?: string;
}

interface TemperatureItem {
  id: string;
  item_name: string;
  display_name: string;
  default_value: number;
  display_order: number;
  department_id: string;
  facility_id: string;
}

interface TemperatureRecord {
  id: string;
  record_date: string;
  is_auto_recorded: boolean;
  temperature_record_details: TemperatureRecordDetail[];
}

/* ───────── コンポーネント ───────── */
export default function TemperatureRecordDetailPage() {
  const router = useRouter();
  // assert non-null so TS won't complain
  const params = useParams()!;
  const searchParams = useSearchParams()!;

  // params.id may be string|string[]|undefined
  const rawId = params.id;
  const recordId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';

  // searchParams.get returns string|null
  const rawDeptName = searchParams.get('department');
  const departmentName = rawDeptName ?? '';

  const rawDeptId = searchParams.get('departmentId');
  const departmentId = rawDeptId ?? '';

  useSessionCheck();
  const { user, loading: authLoading } = useSimpleAuth();

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<TemperatureRecord | null>(null);
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // 未ログインならリダイレクト
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // データ取得
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // 1) レコード取得
        const { data: rec, error: recErr } = await supabase
          .from('temperature_records')
          .select(`
            id,
            record_date,
            is_auto_recorded,
            temperature_record_details (
              id,
              temperature_item_id,
              value,
              data_source
            )
          `)
          .eq('id', recordId)
          .single();
        if (recErr || !rec) throw recErr ?? new Error('Record not found');
        const safeRec: TemperatureRecord = {
          id: rec.id,
          record_date: rec.record_date,
          is_auto_recorded: rec.is_auto_recorded ?? false,
          temperature_record_details: rec.temperature_record_details.map((d) => ({
            id: d.id,
            temperature_item_id: d.temperature_item_id,
            value: d.value ?? 0,
            data_source: d.data_source ?? undefined,
          })),
        };
        setRecord(safeRec);

        // 2) 温度項目取得
        const { data: items, error: itemsErr } = await supabase
          .from('temperature_items')
          .select(
            'id, item_name, display_name, default_value, display_order, department_id, facility_id'
          )
          .eq('department_id', departmentId)
          .order('display_order', { ascending: true });
        if (itemsErr) throw itemsErr;
        const safeItems: TemperatureItem[] = (items ?? []).map((it) => ({
          id: it.id,
          item_name: it.item_name,
          display_name: it.display_name ?? it.item_name,
          default_value: it.default_value ?? 0,
          display_order: it.display_order ?? 0,
          department_id: it.department_id,
          facility_id: it.facility_id,
        }));
        setTemperatureItems(safeItems);

        // 3) 編集用初期値セット
        const init: Record<string, number> = {};
        safeItems.forEach((it) => {
          const detail = safeRec.temperature_record_details.find(
            (d) => d.temperature_item_id === it.id
          );
          init[it.id] = detail?.value ?? it.default_value;
        });
        setEditedValues(init);
      } catch (e: any) {
        console.error('Fetch Error:', e);
        setError('データ取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    }

    if (recordId && departmentId) {
      fetchData();
    }
  }, [recordId, departmentId]);

  // 編集値変更
  const handleValueChange = (itemId: string, value: number) => {
    setEditedValues((prev) => ({ ...prev, [itemId]: value }));
  };

  // 保存
  const saveChanges = async () => {
    if (!record) return;
    setLoading(true);
    try {
      for (const d of record.temperature_record_details) {
        await supabase
          .from('temperature_record_details')
          .update({ value: editedValues[d.temperature_item_id] })
          .eq('id', d.id);
      }
      setIsEditing(false);

      // 再フェッチ
      const { data: rec2, error: rec2Err } = await supabase
        .from('temperature_records')
        .select(`
          id,
          record_date,
          is_auto_recorded,
          temperature_record_details (
            id,
            temperature_item_id,
            value,
            data_source
          )
        `)
        .eq('id', record.id)
        .single();
      if (rec2Err || !rec2) throw rec2Err ?? new Error('Refetch failed');
      setRecord({
        id: rec2.id,
        record_date: rec2.record_date,
        is_auto_recorded: rec2.is_auto_recorded ?? false,
        temperature_record_details: rec2.temperature_record_details.map((d) => ({
          id: d.id,
          temperature_item_id: d.temperature_item_id,
          value: d.value ?? 0,
          data_source: d.data_source ?? undefined,
        })),
      });
    } catch (e) {
      console.error('Update Error:', e);
      setError('更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // 削除
  const deleteRecord = async () => {
    if (!record) return;
    setLoading(true);
    try {
      await supabase
        .from('temperature_record_details')
        .delete()
        .eq('temperature_record_id', record.id);
      await supabase
        .from('temperature_records')
        .delete()
        .eq('id', record.id);
      router.push(
        `/temperature?department=${encodeURIComponent(
          departmentName
        )}&departmentId=${departmentId}`
      );
    } catch (e) {
      console.error('Delete Error:', e);
      setError('削除に失敗しました。');
      setLoading(false);
    }
  };

  // ローディングスピナー
  if (loading && !record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-pink-700 text-center">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="border-b border-border bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => router.back()}>
            <ChevronLeft />
          </button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity /> 記録詳細
          </h1>
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                  <Edit /> 編集
                </Button>
                <Button onClick={() => setDeleteConfirm(true)} variant="destructive" size="sm">
                  <Trash2 /> 削除
                </Button>
              </>
            ) : (
              <>
                <Button onClick={saveChanges} size="sm">
                  <Save /> 保存
                </Button>
                <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
                  キャンセル
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 m-4 rounded flex items-center gap-2">
          <AlertCircle /> {error}
        </div>
      )}

      {/* 詳細 */}
      {record && (
        <main className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-medium mb-4">
              記録日:{' '}
              {formatJSTDate(record.record_date)}{' '}
              {record.is_auto_recorded && (
                <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                  自動
                </span>
              )}
            </h2>
            <div className="space-y-4">
              {temperatureItems.map((it) => {
                const detail = record.temperature_record_details.find(
                  (d) => d.temperature_item_id === it.id
                );
                const val = detail?.value;
                const isBool = it.item_name === 'seika_samplecheck';
                const isSensor = detail?.data_source === 'sensor';
                return (
                  <div key={it.id} className="flex justify-between items-center">
                    <span className="font-medium">{it.display_name}</span>
                    {isEditing ? (
                      isBool ? (
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 p-2 rounded cursor-pointer bg-gray-100">
                            <input
                              type="radio"
                              checked={editedValues[it.id] === 1}
                              onChange={() => handleValueChange(it.id, 1)}
                              className="sr-only"
                            />
                            <Check /> OK
                          </label>
                          <label className="flex items-center gap-1 p-2 rounded cursor-pointer bg-gray-100">
                            <input
                              type="radio"
                              checked={editedValues[it.id] === 0}
                              onChange={() => handleValueChange(it.id, 0)}
                              className="sr-only"
                            />
                            <X /> NG
                          </label>
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="0.1"
                          value={editedValues[it.id]}
                          onChange={(e) =>
                            handleValueChange(it.id, parseFloat(e.target.value))
                          }
                          className="border px-2 py-1 w-24 text-right"
                        />
                      )
                    ) : val != null ? (
                      isBool ? (
                        val === 1 ? (
                          <div className="flex items-center text-green-600">
                            <Check /> OK
                          </div>
                        ) : (
                          <div className="flex items-center text-red-600">
                            <X /> NG
                          </div>
                        )
                      ) : (
                        <div className={isSensor ? 'text-blue-600' : ''}>
                          {val}℃{isSensor && <span> ●</span>}
                        </div>
                      )
                    ) : (
                      <span className="text-gray-400">未記録</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 戻るボタン */}
          <div className="flex justify-center">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() =>
                  router.push(
                    `/temperature?department=${encodeURIComponent(
                      departmentName
                    )}&departmentId=${departmentId}`
                  )
                }
              >
                <ChevronLeft /> 一覧へ戻る
              </Button>
            </motion.div>
          </div>
        </main>
      )}

      {/* 削除確認 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-sm w-full space-y-4">
            <h3 className="text-xl font-semibold">本当に削除しますか？</h3>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
                キャンセル
              </Button>
              <Button variant="destructive" onClick={deleteRecord}>
                {loading ? '削除中…' : '削除する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
