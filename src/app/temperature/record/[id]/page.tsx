'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ChevronLeft, Home, Bell, Save, Trash2, Edit, AlertCircle, Activity, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useSimpleAuth } from '@/hooks/useSimpleAuth';
import { useSessionCheck } from '@/hooks/useSessionCheck';

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
}

interface TemperatureRecord {
  id: string;
  record_date: string;
  temperature_record_details: TemperatureRecordDetail[];
  is_auto_recorded: boolean;
}

export default function TemperatureRecordDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = params?.id as string;
  const departmentName = searchParams?.get("department") || "部署未指定";
  const departmentId = searchParams?.get("departmentId") || "";
  
  // セッション確認を無効化
  useSessionCheck(false, []);
  
  // シンプルな認証フックを使用（定期的なセッション確認なし）
  const { user, loading: authLoading } = useSimpleAuth();

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<TemperatureRecord | null>(null);
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValues, setEditedValues] = useState<{[key: string]: number}>({});
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ユーザーがログインしていない場合はログインページにリダイレクト
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // 記録とアイテムを取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 記録データを取得
        const { data: recordData, error: recordError } = await supabase
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

        if (recordError) {
          throw new Error(recordError.message);
        }

        setRecord(recordData);

        // 温度アイテムを取得
        const { data: itemsData, error: itemsError } = await supabase
          .from('temperature_items')
          .select('*')
          .eq('department_id', departmentId)
          .order('display_order', { ascending: true });

        if (itemsError) {
          throw new Error(itemsError.message);
        }

        setTemperatureItems(itemsData || []);

        // 編集用の値を初期化（デフォルト値も設定）
        const initialValues: {[key: string]: number} = {};
        itemsData.forEach((item: TemperatureItem) => {
          // まず全ての項目にデフォルト値を設定
          initialValues[item.id] = item.default_value;
        });
        
        // 次に既存のデータで上書き
        recordData.temperature_record_details.forEach((detail: TemperatureRecordDetail) => {
          initialValues[detail.temperature_item_id] = detail.value;
        });
        
        setEditedValues(initialValues);
      } catch (error) {
        console.error('データ取得エラー:', error);
        setError('データの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    if (recordId && departmentId) {
      fetchData();
    }
  }, [recordId, departmentId]);

  // 値の変更ハンドラ
  const handleValueChange = (itemId: string, value: number) => {
    setEditedValues((prev) => ({
      ...prev,
      [itemId]: value
    }));
  };

  // 更新を保存
  const saveChanges = async () => {
    setLoading(true);
    setError(null);
    try {
      // 既存のdetailsをIDで取得
      const existingDetails = record?.temperature_record_details || [];
      
      // 更新と新規追加を分ける
      const updatePromises: any[] = [];
      const newDetails: any[] = [];
      
      Object.entries(editedValues).forEach(([itemId, value]) => {
        const detailToUpdate = existingDetails.find(d => d.temperature_item_id === itemId);
        
        if (detailToUpdate) {
          // 既存データの更新
          updatePromises.push(
            supabase
              .from('temperature_record_details')
              .update({ value })
              .eq('id', detailToUpdate.id)
          );
        } else {
          // 新規データの追加
          newDetails.push({
            temperature_record_id: recordId,
            temperature_item_id: itemId,
            value: value,
            data_source: 'manual'
          });
        }
      });
      
      // 更新を実行
      for (const updatePromise of updatePromises) {
        const { error } = await updatePromise;
        if (error) throw error;
      }
      
      // 新規データがあれば追加
      if (newDetails.length > 0) {
        const { error: insertError } = await supabase
          .from('temperature_record_details')
          .insert(newDetails);
          
        if (insertError) throw new Error(insertError.message);
      }
      
      // 編集モードを終了
      setIsEditing(false);
      
      // データを再取得
      const { data: updatedRecord, error: fetchError } = await supabase
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
        
      if (fetchError) throw new Error(fetchError.message);
      
      setRecord(updatedRecord);
    } catch (error) {
      console.error('更新エラー:', error);
      setError('データの更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // 記録の削除
  const deleteRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      // 関連する詳細レコードを削除
      await supabase
        .from('temperature_record_details')
        .delete()
        .eq('temperature_record_id', recordId);
      
      // メインレコードを削除
      const { error: deleteError } = await supabase
        .from('temperature_records')
        .delete()
        .eq('id', recordId);
        
      if (deleteError) throw new Error(deleteError.message);
      
      // 一覧ページに戻る
      router.push(`/temperature?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`);
    } catch (error) {
      console.error('削除エラー:', error);
      setError('データの削除に失敗しました。');
      setLoading(false); // エラー時のみここで終了
    }
  };

  if (loading && !record) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">データを読み込み中...</p>
        </div>
      </div>
    );
  }

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
            <h1 className="text-xl font-semibold">温度記録詳細</h1>
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

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {record && (
          <>
            {/* 記録メタデータ */}
            <div className="bg-white p-6 rounded-lg border border-border">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  記録日: {new Date(record.record_date).toLocaleDateString('ja-JP')}
                  {record.is_auto_recorded && (
                    <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">自動記録</span>
                  )}
                </h2>
                <div className="flex gap-2">
                  {!isEditing ? (
                    <>
                      <Button
                        onClick={() => setIsEditing(true)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-4 w-4" />
                        編集
                      </Button>
                      <Button
                        onClick={() => setDeleteConfirm(true)}
                        variant="destructive"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        削除
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={saveChanges}
                        variant="default"
                        size="sm"
                        className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                      >
                        <Save className="h-4 w-4" />
                        保存
                      </Button>
                      <Button
                        onClick={() => setIsEditing(false)}
                        variant="outline"
                        size="sm"
                      >
                        キャンセル
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* 温度データ */}
              <div className="space-y-4">
                {temperatureItems.map((item) => {
                  const detail = record.temperature_record_details.find(
                    (d) => d.temperature_item_id === item.id
                  );
                  const value = detail?.value;
                  const isSensorData = detail?.data_source === 'sensor';
                  const isCheckItem = item.item_name === "seika_samplecheck";

                  return (
                    <div key={item.id} className="border-b border-gray-100 pb-3 last:border-0">
                      <div className="flex justify-between items-center">
                        <div className="font-medium text-gray-700 flex items-center">
                          {item.display_name || item.item_name}
                          {isSensorData && <span className="ml-2 text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">センサー</span>}
                        </div>
                        {isEditing ? (
                          isCheckItem ? (
                            <div className="flex gap-3">
                              <label className={`flex items-center gap-1 p-2 rounded cursor-pointer ${editedValues[item.id] === 1 ? 'bg-green-50 text-green-700' : 'bg-gray-50'}`}>
                                <input
                                  type="radio"
                                  name={`check_${item.id}`}
                                  checked={editedValues[item.id] === 1}
                                  onChange={() => handleValueChange(item.id, 1)}
                                  className="sr-only"
                                />
                                <Check className="h-5 w-5" />
                                <span>OK</span>
                              </label>
                              <label className={`flex items-center gap-1 p-2 rounded cursor-pointer ${editedValues[item.id] === 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50'}`}>
                                <input
                                  type="radio"
                                  name={`check_${item.id}`}
                                  checked={editedValues[item.id] === 0}
                                  onChange={() => handleValueChange(item.id, 0)}
                                  className="sr-only"
                                />
                                <X className="h-5 w-5" />
                                <span>NG</span>
                              </label>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="number"
                                step="0.1"
                                value={editedValues[item.id] !== undefined ? editedValues[item.id] : item.default_value}
                                onChange={(e) => handleValueChange(item.id, parseFloat(e.target.value))}
                                className="border border-gray-300 p-2 rounded w-24 text-right"
                              />
                              <span className="ml-2">℃</span>
                            </div>
                          )
                        ) : (
                          value !== undefined && value !== null ? (
                            isCheckItem ? (
                              value === 1 ? (
                                <div className="flex items-center text-green-600">
                                  <Check className="h-5 w-5 mr-1" />
                                  <span>OK</span>
                                </div>
                              ) : (
                                <div className="flex items-center text-red-600">
                                  <X className="h-5 w-5 mr-1" />
                                  <span>NG</span>
                                </div>
                              )
                            ) : (
                              <div className={isSensorData ? "text-blue-600 font-medium" : "text-gray-900"}>
                                {value}℃
                                {isSensorData && <span className="ml-1 text-xs text-blue-500">●</span>}
                              </div>
                            )
                          ) : (
                            <span className="text-gray-400">未記録</span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 戻るボタン */}
            <div className="flex justify-center">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={() => router.push(`/temperature?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`)}
                  className="bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white font-medium px-6 py-3 rounded-xl transition-all duration-300"
                >
                  <ChevronLeft className="mr-2 h-5 w-5" />
                  一覧に戻る
                </Button>
              </motion.div>
            </div>
          </>
        )}

        {/* 削除確認モーダル */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-semibold mb-4">記録を削除しますか？</h3>
              <p className="text-gray-600 mb-6">
                この操作は元に戻せません。記録日 {record && new Date(record.record_date).toLocaleDateString('ja-JP')} のデータが完全に削除されます。
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirm(false)}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={deleteRecord}
                  disabled={loading}
                >
                  {loading ? '削除中...' : '削除する'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 