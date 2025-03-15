'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, ThermometerSnowflake, ChevronLeft, Home } from 'lucide-react';
import { Slot } from '@radix-ui/react-slot';
import { supabase } from '@/lib/supabaseClient';
import { getCachedFacility, cacheFacility } from '@/lib/facilityCache';
import { getCurrentUser } from '@/lib/userCache';

interface TemperatureItem {
  id: string;
  item_name: string;       // DB 内部用システム名
  display_name: string;    // 表示名
  default_value: number;
  display_order: number;   // 順序
  department_id: string;
  facility_id: string;     // 施設ID
}

function NewTemperatureRecordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get("department") || "部署未指定";
  const departmentId = searchParams?.get("departmentId") || "";

  // 日付は初期値を「今日」に設定
  const today = new Date().toISOString().slice(0, 10);
  const [recordDate, setRecordDate] = useState(today);

  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  // 各項目の入力値を item.id => number|boolean で保持
  const [formValues, setFormValues] = useState<Record<string, number | boolean>>({});
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityName, setFacilityName] = useState<string>("");

  useEffect(() => {
    if (!departmentId) return;

    const fetchItems = async () => {
      try {
        // まずキャッシュから施設情報を取得
        const cachedFacility = getCachedFacility();
        
        if (cachedFacility && cachedFacility.id) {
          // キャッシュに施設情報がある場合はそれを使用
          setFacilityId(cachedFacility.id);
          setFacilityName(cachedFacility.name || '');
          
          // キャッシュから取得した施設IDでアイテムを取得
          const { data, error } = await supabase
            .from("temperature_items")
            .select("id, item_name, display_name, default_value, display_order, department_id, facility_id")
            .eq("department_id", departmentId)
            .eq("facility_id", cachedFacility.id)
            .order("display_order", { ascending: true });

          if (error) {
            console.error("Fetch Items Error:", error);
            return;
          }
          
          if (data) {
            setTemperatureItems(data);

            // 各項目の初期値設定
            const initialValues: Record<string, number | boolean> = {};
            data.forEach((item) => {
              initialValues[item.id] =
                item.item_name === "seika_samplecheck"
                  ? false
                  : item.default_value;
            });
            setFormValues(initialValues);
          }
          
          return; // キャッシュから取得できたので処理終了
        }
        
        // キャッシュに施設情報がない場合は、ユーザー情報から取得
        const userProfile = await getCurrentUser();
        if (!userProfile || !userProfile.id) {
          console.error("ユーザー情報の取得に失敗しました");
          return;
        }
        
        // ユーザープロファイルから施設IDを取得
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("facility_id")
          .eq("id", userProfile.id)
          .single();
          
        if (profileError || !profileData?.facility_id) {
          console.error("施設情報の取得に失敗しました");
          return;
        }
        
        // 施設IDを保存
        setFacilityId(profileData.facility_id);
        
        // 施設名を取得
        const { data: facilityData, error: facilityError } = await supabase
          .from("facilities")
          .select("id, name")
          .eq("id", profileData.facility_id)
          .single();
          
        if (!facilityError && facilityData) {
          setFacilityName(facilityData.name);
          
          // 施設情報をキャッシュに保存
          cacheFacility({
            id: facilityData.id,
            name: facilityData.name
          });
        }
        
        // 特定の施設IDと部署IDに一致するアイテムを取得
        const { data, error } = await supabase
          .from("temperature_items")
          .select("id, item_name, display_name, default_value, display_order, department_id, facility_id")
          .eq("department_id", departmentId)
          .eq("facility_id", profileData.facility_id)
          .order("display_order", { ascending: true });

        if (error) {
          console.error("Fetch Items Error:", error);
          return;
        }
        if (data) {
          setTemperatureItems(data);

          // 各項目の初期値 (bool => false, 数値 => default_value)
          const initialValues: Record<string, number | boolean> = {};
          data.forEach((item) => {
            initialValues[item.id] =
              item.item_name === "seika_samplecheck"
                ? false
                : item.default_value;
          });
          setFormValues(initialValues);
        }
      } catch (err) {
        console.error("Error fetching temperature items:", err);
      }
    };

    fetchItems();
  }, [departmentId]);

  const handleInputChange = (itemId: string, value: number | boolean) => {
    setFormValues((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!departmentId) {
      alert("部署情報が不足しています。");
      return;
    }
    
    if (!facilityId) {
      alert("施設情報の取得に失敗しました。再読み込みして試してください。");
      return;
    }

    // temperature_records にヘッダを作成
    const { data: recordData, error: recordError } = await supabase
      .from("temperature_records")
      .insert([
        {
          department_id: departmentId,
          record_date: recordDate,
          facility_id: facilityId, // 施設IDを追加
        },
      ])
      .select()
      .single();

    if (recordError) {
      console.error("Record Save Error:", recordError);
      alert("記録の保存に失敗しました。");
      return;
    }

    const recordId = recordData.id;

    // temperature_record_details へ各項目を保存 (bool => 0/1 に変換)
    const details = temperatureItems.map((item) => {
      const rawValue = formValues[item.id];
      const finalValue =
        item.item_name === "seika_samplecheck"
          ? (rawValue ? 1 : 0)
          : rawValue;

      return {
        temperature_record_id: recordId,
        temperature_item_id: item.id,
        value: finalValue,
      };
    });

    const { error: detailsError } = await supabase
      .from("temperature_record_details")
      .insert(details);

    if (detailsError) {
      console.error("Details Save Error:", detailsError);
      alert("詳細記録の保存に失敗しました。");
      return;
    }

    // 記録完了後、一覧画面へ戻る
    router.push(
      `/temperature?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`
    );
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-white">
      {/* ヘッダー */}
      <header className="border-b border-border bg-white sticky top-0">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          {/* 戻るボタン */}
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>

          {/* 中央配置のタイトル */}
          <div className="flex-1 flex items-center justify-center gap-4">
            <ThermometerSnowflake className="h-6 w-6 text-[rgb(155,135,245)]" />
            <h1 className="text-xl font-semibold">New Temperature Record</h1>
          </div>

          {/* 右側のホームボタン */}
          <button
            onClick={() => router.push('/depart')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Home className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </header>

      {/* 施設・部署名表示 */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          {facilityName && (
            <h2 className="cutefont text-lg font-medium text-gray-800">
              施設: {facilityName}
            </h2>
          )}
          {facilityName && departmentName && (
            <span className="hidden sm:inline text-gray-400">-</span>
          )}
          <h2 className="cutefont text-lg font-medium text-gray-800">
            部署: {departmentName}
          </h2>
        </div>
      </div>

      {/* メインフォーム */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-lg border border-border space-y-4"
        >
          {/* 日付入力 */}
          <div>
            <label
              htmlFor="recordDate"
              className="block text-sm font-medium text-gray-800 bg-gray-50"
            >
              Date
            </label>
            <input
              id="recordDate"
              type="date"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
              className="mt-1 block w-40 border border-border rounded-md px-3 py-2 text-gray-800"
              required
            />
          </div>

          {/* 各項目の入力 */}
          <div className="space-y-4">
            {temperatureItems.map((item) => {
              const displayLabel = item.display_name || item.item_name;
              const isBoolItem = item.item_name === "seika_samplecheck";

              return (
                <div key={item.id} className="flex items-center gap-4">
                  {/* 項目名 */}
                  <label
                    htmlFor={item.id}
                    className="text-sm font-medium text-gray-800 w-1/3 bg-gray-50"
                  >
                    {displayLabel}
                  </label>

                  {/* 入力欄またはチェックボックス */}
                  {isBoolItem ? (
                    <input
                      id={item.id}
                      type="checkbox"
                      checked={Boolean(formValues[item.id])}
                      onChange={(e) => handleInputChange(item.id, e.target.checked)}
                      className="h-5 w-5 border border-border rounded-md"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleInputChange(item.id, Number(formValues[item.id]) - 1)
                          }
                          className="px-3 py-1 border border-gray-800 rounded-l-md hover:bg-blue-300 text-gray-800"
                        >
                          -
                        </button>
                        <input
                          id={item.id}
                          type="number"
                          value={formValues[item.id] as number}
                          onChange={(e) =>
                            handleInputChange(item.id, Number(e.target.value))
                          }
                          className="w-24 border border-border rounded-md px-2 py-1 text-gray-800"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleInputChange(item.id, Number(formValues[item.id]) + 1)
                          }
                          className="px-3 py-1 border border-gray-800 rounded-r-md hover:bg-orange-300 text-gray-800"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-gray-800">℃</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Slot>
            <button
              type="submit"
              className="w-full bg-[rgb(155,135,245)] hover:bg-violet-300 text-white rounded-md px-4 py-2.5 font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 flex items-center justify-center gap-2"
            >
              <Plus className="h-5 w-5" />
              Save Record
            </button>
          </Slot>
        </form>
      </main>
    </div>
  );
}

export default function NewTemperatureRecord() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewTemperatureRecordContent />
    </Suspense>
  );
}
