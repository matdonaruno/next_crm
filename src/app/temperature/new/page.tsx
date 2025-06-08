'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, ThermometerSnowflake, ChevronLeft, Home } from 'lucide-react';
import supabase from '@/lib/supabaseBrowser';
import { getCachedFacility, cacheFacility } from '@/lib/facilityCache';
import { getCurrentUser } from '@/lib/userCache';

// 温度項目の型定義
type TemperatureItem = {
  id: string;
  item_name: string;
  display_name: string | null;
  default_value: number | null;
  display_order: number | null;
  department_id: string;
  facility_id: string;
};

// ページラッパー
export default function NewTemperatureRecord() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-10 w-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-pink-700 text-center">読み込み中...</p>
        </div>
      </div>
    }>
      <NewTemperatureRecordContent />
    </Suspense>
  );
}

// フォーム本体コンポーネント
function NewTemperatureRecordContent() {
  const router = useRouter();
  const searchParams = useSearchParams()!;
  const departmentName = searchParams.get('department') ?? '';
  const departmentId = searchParams.get('departmentId') ?? '';

  // 日付
  const today = new Date().toISOString().slice(0, 10);
  const [recordDate, setRecordDate] = useState(today);

  // データ取得／状態管理
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [formValues, setFormValues] = useState<Record<string, number | boolean>>({});
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityName, setFacilityName] = useState<string>('');
  const [userFullname, setUserFullname] = useState<string>('');
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 初期ロード: 温度項目を取得
  useEffect(() => {
    if (!departmentId) return;

    setLoadingItems(true);
    (async () => {
      try {
        // 1) キャッシュ確認
        const cached = getCachedFacility();
        if (cached?.id) {
          // ユーザー情報取得
          const userProfile = await getCurrentUser();
          if (userProfile?.fullname) {
            setUserFullname(userProfile.fullname);
          }
          await loadItems(cached.id, cached.name);
        } else {
          // 2) プロフィール経由で facility_id を取得
          const userProfile = await getCurrentUser();
          if (!userProfile?.id) throw new Error('ユーザー情報が取得できません');
          
          // ユーザーのフルネーム設定
          if (userProfile.fullname) {
            setUserFullname(userProfile.fullname);
          }
          
          const { data: prof } = await supabase
            .from('profiles')
            .select('facility_id')
            .eq('id', userProfile.id)
            .single();
          if (!prof?.facility_id) throw new Error('施設IDが取得できません');

          // 施設名取得 & キャッシュ
          const { data: fac } = await supabase
            .from('facilities')
            .select('id,name')
            .eq('id', prof.facility_id)
            .single();
          if (!fac) throw new Error('施設情報が取得できません');
          cacheFacility({ id: fac.id, name: fac.name });
          await loadItems(prof.facility_id, fac.name);
        }
      } catch (e: any) {
        console.error('Items Fetch Error:', e);
        setErrorMessage('温度項目の取得に失敗しました');
      } finally {
        setLoadingItems(false);
      }
    })();

    async function loadItems(facId: string, facName: string) {
      setFacilityId(facId);
      setFacilityName(facName);

      const { data, error } = await supabase
        .from('temperature_items')
        .select(
          'id,item_name,display_name,default_value,display_order,department_id,facility_id'
        )
        .eq('department_id', departmentId)
        .eq('facility_id', facId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      if (!data) throw new Error('データがありません');

      setTemperatureItems(data);
      // 初期フォーム値
      const initial: Record<string, number | boolean> = {};
      data.forEach((item) => {
        initial[item.id] =
          item.item_name === 'seika_samplecheck' ? false : item.default_value ?? 0;
      });
      setFormValues(initial);
    }
  }, [departmentId]);

  // フォーム入力ハンドラ
  const handleInputChange = (itemId: string, value: number | boolean) => {
    setFormValues((prev) => ({ ...prev, [itemId]: value }));
  };

  // サブミットハンドラ
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId || !facilityId) {
      setErrorMessage('部署または施設情報が不足しています');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      // ヘッダー保存
      const { data: record, error: recErr } = await supabase
        .from('temperature_records')
        .insert({ department_id: departmentId, facility_id: facilityId, record_date: recordDate })
        .select()
        .single();
      if (recErr || !record) throw recErr || new Error('RecordSaveError');

      // 明細保存
      const details = temperatureItems.map((item) => {
        const raw = formValues[item.id];
        return {
          temperature_record_id: record.id,
          temperature_item_id: item.id,
          value: item.item_name === 'seika_samplecheck' ? (raw ? 1 : 0) : Number(raw),
        };
      });
      const { error: detErr } = await supabase
        .from('temperature_record_details')
        .insert(details);
      if (detErr) throw detErr;

      // 画面遷移
      router.push(
        `/temperature?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`
      );
    } catch (e: any) {
      console.error('Save Error:', e);
      setErrorMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center h-16 px-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1 flex justify-center items-center gap-2">
            <ThermometerSnowflake className="h-6 w-6 text-violet-400" />
            <h1 className="text-xl font-semibold text-gray-800">新規温度記録</h1>
          </div>
          <button onClick={() => router.push('/depart')} className="p-2 hover:bg-gray-100 rounded-full">
            <Home className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </header>

      {/* 施設・部署・ユーザー表示 */}
      <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap gap-4 items-center">
        {facilityName && <span className="font-medium text-gray-800">施設: {facilityName}</span>}
        {departmentName && <span className="font-medium text-gray-800">部署: {departmentName}</span>}
        {userFullname && <span className="font-medium text-gray-800">ユーザー: {userFullname}</span>}
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* エラーメッセージ */}
        {errorMessage && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded flex items-center">
            {errorMessage}
          </div>
        )}

        {/* 読み込みスピナー */}
        {loadingItems ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-12 w-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border space-y-6">
            {/* 日付入力 */}
            <div>
              <label htmlFor="recordDate" className="block text-sm font-medium text-gray-800">
                日付
              </label>
              <input
                id="recordDate"
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                className="mt-1 block w-40 border border-gray-300 rounded-md px-3 py-2 text-gray-800"
                required
              />
            </div>

            {/* 各項目 */}
            <div className="space-y-4">
              {temperatureItems.map((item) => {
                const label = item.display_name ?? item.item_name;
                const isBool = item.item_name === 'seika_samplecheck';
                const value = formValues[item.id];
                return (
                  <div key={item.id} className="flex items-center gap-4">
                    <label htmlFor={item.id} className="w-1/3 text-sm font-medium text-gray-800">
                      {label}
                    </label>
                    {isBool ? (
                      <input
                        id={item.id}
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => handleInputChange(item.id, e.target.checked)}
                        className="h-5 w-5"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleInputChange(item.id, Number(value) - 1)}
                          className="px-3 py-1 border border-gray-300 rounded-l-md text-gray-700 hover:bg-gray-50"
                        >
                          -
                        </button>
                        <input
                          id={item.id}
                          type="number"
                          value={value as number}
                          onChange={(e) => handleInputChange(item.id, Number(e.target.value))}
                          className="w-24 border border-gray-300 px-2 py-1 text-right text-gray-800"
                          min={-50}
                          max={150}
                          step={0.1}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => handleInputChange(item.id, Number(value) + 1)}
                          className="px-3 py-1 border border-gray-300 rounded-r-md text-gray-700 hover:bg-gray-50"
                        >
                          +
                        </button>
                        <span className="text-gray-700">℃</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 保存ボタン */}
            <button
              type="submit"
              className={`w-full flex items-center justify-center gap-2 rounded-md px-4 py-2 font-medium text-white ${
                saving
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-violet-400 hover:bg-violet-500'
              }`}
              disabled={saving}
            >
              {saving ? '保存中…' : <><Plus className="h-5 w-5" /> 記録を保存</>}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
