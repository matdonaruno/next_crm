'use client';

import { Calendar } from "@/components/ui/calendar";
import { Bell, Plus, FileText, ChevronLeft, Home, Check, X, Activity } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DayContentProps } from "react-day-picker";
import { getCachedFacility, cacheFacility } from '@/lib/facilityCache';
import { getCurrentUser } from '@/lib/userCache';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSimpleAuth } from '@/hooks/useSimpleAuth';
import { useSessionCheck } from '@/hooks/useSessionCheck';

interface TemperatureRecordDetail {
  id: string;
  temperature_item_id: string;
  value: number;
  data_source?: string; // 'manual'または'sensor'
}

interface TemperatureRecord {
  id: string;
  record_date: string;
  temperature_record_details: TemperatureRecordDetail[];
  facility_id: string;
  is_auto_recorded?: boolean; // 自動記録されたかどうか
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

// ESPセンサーからのリアルタイムデータ
interface SensorData {
  ahtTemp: number | null;
  bmpTemp: number | null;
  ahtHum: number | null;
  bmpPres: number | null;
  lastUpdated: string | null;
}

export default function TemperatureManagementClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get("department") || "部署未指定";
  const departmentId = searchParams?.get("departmentId") || "";

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [records, setRecords] = useState<TemperatureRecord[]>([]);
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [facilityName, setFacilityName] = useState<string>("");
  const [facilityId, setFacilityId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // センサーデータの状態
  const [showSensorData, setShowSensorData] = useState(true);
  const [sensorData, setSensorData] = useState<SensorData>({
    ahtTemp: null,
    bmpTemp: null,
    ahtHum: null,
    bmpPres: null,
    lastUpdated: ""
  });

  // 自動記録データの表示設定
  const [includeAutoRecords, setIncludeAutoRecords] = useState<boolean>(false);

  // シンプルな認証フックを使用
  const { user, loading: authLoading } = useSimpleAuth();
  
  // このページではセッション確認を必要最小限にする
  useSessionCheck(true, []);
  
  // ユーザーがログインしていない場合はログインページにリダイレクト
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!departmentId) return;

    const fetchItems = async () => {
      setLoading(true);
      
      try {
        // ユーザー情報を取得（キャッシュ→DB）
        const userProfile = await getCurrentUser();
        if (userProfile && userProfile.fullname) {
          setUserName(userProfile.fullname);
        }
        
        // 施設情報を取得（キャッシュ→DB）
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
            console.error("Temperature Items Error:", error);
          } else if (data) {
            setTemperatureItems(data);
          }
          
          // 施設IDが設定されたので、ここでfetchRecordsを呼び出す
          fetchRecords(cachedFacility.id);
          return; // キャッシュから取得できたので処理終了
        }
      
        // キャッシュに施設情報がない場合はデータベースから取得
        if (!userProfile || !userProfile.id) {
          console.error("ユーザー情報の取得に失敗しました");
          setLoading(false);
          return;
        }
        
        // ユーザーのプロファイルから施設IDを取得
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("facility_id")
          .eq("id", userProfile.id)
          .single();
          
        if (profileError || !profileData?.facility_id) {
          console.error("施設情報の取得に失敗しました");
          setLoading(false);
          return;
        }
        
        // 施設情報を取得
        const { data: facilityData, error: facilityError } = await supabase
          .from("facilities")
          .select("id, name")
          .eq("id", profileData.facility_id)
          .single();
          
        if (!facilityError && facilityData) {
          setFacilityId(facilityData.id);
          setFacilityName(facilityData.name);
          
          // 施設情報をキャッシュに保存
          cacheFacility({
            id: facilityData.id,
            name: facilityData.name
          });
        }
        
        const { data, error } = await supabase
          .from("temperature_items")
          .select("id, item_name, display_name, default_value, display_order, department_id, facility_id")
          .eq("department_id", departmentId)
          .eq("facility_id", profileData.facility_id)
          .order("display_order", { ascending: true });

        if (error) {
          console.error("Temperature Items Error:", error);
        } else if (data) {
          setTemperatureItems(data);
        }
        
        // データベースから取得した施設IDでfetchRecordsを呼び出す
        if (profileData.facility_id) {
          fetchRecords(profileData.facility_id);
        }
      } catch (error) {
        console.error("Error fetching items:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchRecords = async (currentFacilityId: string) => {
      if (!currentFacilityId) {
        console.error("施設IDが不明です");
        return;
      }
      
      setLoading(true);
      try {
        console.log("レコード取得開始:", { departmentId, facilityId: currentFacilityId, includeAutoRecords });
        
        // is_auto_recordedフィルターを追加
        let query = supabase
          .from("temperature_records")
          .select(`
            id,
            record_date,
            is_auto_recorded,
            temperature_record_details (
              id,
              temperature_item_id,
              value,
              data_source
            ),
            facility_id
          `)
          .eq("department_id", departmentId)
          .eq("facility_id", currentFacilityId);
        
        // 自動記録を含まない場合（デフォルト）
        if (!includeAutoRecords) {
          query = query.eq("is_auto_recorded", false);
        }
        
        // 日付の降順で取得
        const { data, error } = await query.order("record_date", { ascending: false });

        if (error) throw error;

        console.log(`${data?.length || 0}件のレコードを取得しました`);
        setRecords(data || []);
        
        // 日付データの集合を作成
        const dates = new Set<string>();
        data?.forEach((record) => {
          // レコードの日付をYYYY-MM-DD形式の文字列に変換
          const recordDate = new Date(record.record_date);
          const year = recordDate.getFullYear();
          const month = String(recordDate.getMonth() + 1).padStart(2, '0');
          const day = String(recordDate.getDate()).padStart(2, '0');
          const localDateStr = `${year}-${month}-${day}`;
          
          dates.add(localDateStr);
          console.log(`レコード日付変換: ${record.record_date} → ${localDateStr}`);
        });
        
        console.log(`${dates.size}件の日付にデータがあります:`, [...dates]);
        setDatesWithData(dates);
      } catch (error) {
        console.error("Error fetching records:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [departmentId, includeAutoRecords]);

  // includeAutoRecordsが変更された場合に再取得
  useEffect(() => {
    if (facilityId && departmentId) {
      const fetchRecordsAgain = async () => {
        setLoading(true);
        try {
          console.log("フィルター変更によるレコード再取得:", { includeAutoRecords });
          
          let query = supabase
            .from("temperature_records")
            .select(`
              id,
              record_date,
              is_auto_recorded,
              temperature_record_details (
                id,
                temperature_item_id,
                value,
                data_source
              ),
              facility_id
            `)
            .eq("department_id", departmentId)
            .eq("facility_id", facilityId);
          
          if (!includeAutoRecords) {
            query = query.eq("is_auto_recorded", false);
          }
          
          const { data, error } = await query.order("record_date", { ascending: false });

          if (error) throw error;

          console.log(`フィルター変更後: ${data?.length || 0}件のレコードを取得しました`);
          setRecords(data || []);
          
          const dates = new Set<string>();
          data?.forEach((record) => {
            // レコードの日付をYYYY-MM-DD形式の文字列に変換
            const recordDate = new Date(record.record_date);
            const year = recordDate.getFullYear();
            const month = String(recordDate.getMonth() + 1).padStart(2, '0');
            const day = String(recordDate.getDate()).padStart(2, '0');
            const localDateStr = `${year}-${month}-${day}`;
            
            dates.add(localDateStr);
            console.log(`レコード日付変換: ${record.record_date} → ${localDateStr}`);
          });
          
          console.log(`フィルター変更後: ${dates.size}件の日付にデータがあります`);
          setDatesWithData(dates);
        } catch (error) {
          console.error("Error fetching records after filter change:", error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchRecordsAgain();
    }
  }, [facilityId, departmentId, includeAutoRecords]);

  // 最新のセンサーデータを取得する関数
  const fetchLatestSensorData = useCallback(async () => {
    if (!facilityId || !departmentId) {
      console.log('必要なデータが不足しています:', { facilityId, departmentId });
      return;
    }
    
    try {
      console.log('最新センサーデータを取得しています:', { facilityId, departmentId });
      
      // センサーデバイスを取得 - sensor_dataと同じ方法で取得
      let query = supabase
        .from('sensor_devices')
        .select('id')
        .eq('facility_id', facilityId);
      
      // 部署IDが指定されている場合は絞り込み
      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }
      
      const { data: deviceData, error: deviceError } = await query;
        
      if (deviceError) {
        console.error('センサーデバイス取得エラー:', deviceError);
        return;
      }
      
      if (!deviceData || deviceData.length === 0) {
        console.log('この部署のセンサーデバイスが見つかりません');
        return;
      }
      
      // 最初のデバイスを使用
      console.log('センサーデバイスを発見:', deviceData[0]);
      const deviceId = deviceData[0].id;
      
      // デバイスからの最新のセンサーログを取得
      console.log(`デバイスID ${deviceId} の最新ログを検索中...`);
      const { data: logData, error: logError } = await supabase
        .from('sensor_logs')
        .select('raw_data, recorded_at')
        .eq('sensor_device_id', deviceId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();
        
      if (logError) {
        console.error('センサーログ取得エラー:', logError);
        return;
      }
      
      console.log('最新のセンサーログを取得しました:', logData);
      
      // UTCタイムスタンプを変換
      const utcDate = new Date(logData.recorded_at);
      // UTCから直接変換してJSTの現地時間として表示（UTCから9時間引く）
      const jstDate = new Date(utcDate.getTime() - 9 * 60 * 60 * 1000);
      
      console.log('タイムスタンプの解析:', {
        original: logData.recorded_at,
        parsed: utcDate,
        formatted: jstDate.toLocaleString()
      });
      
      // センサーデータがあればフラグを立てる
      setShowSensorData(true);
      
      // センサーデータを設定
      setSensorData({
        ahtTemp: logData.raw_data.ahtTemp || null,
        bmpTemp: logData.raw_data.bmpTemp || null,
        ahtHum: logData.raw_data.ahtHum || null,
        bmpPres: logData.raw_data.bmpPres || null,
        lastUpdated: logData.recorded_at
      });
      
      console.log('センサーデータを設定しました:', {
        timestamp: logData.recorded_at,
        localTime: jstDate.toLocaleString(),
        utcTime: new Date(logData.recorded_at).toUTCString()
      });
    } catch (error) {
      console.error('センサーデータ取得エラー:', error);
    }
  }, [facilityId, departmentId]);
  
  // リアルタイムセンサーデータの取得
  useEffect(() => {
    if (!facilityId) return;

    console.log('リアルタイムセンサーデータ取得を開始します');
    
    // 最新のセンサーデータを取得
    fetchLatestSensorData();

    // 1分ごとに更新
    const interval = setInterval(fetchLatestSensorData, 60 * 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [facilityId, departmentId, fetchLatestSensorData]);

  const CustomDayContent = (props: DayContentProps) => {
    // カレンダーコンポーネントの日付を処理する
    // カレンダーの日付はブラウザのローカルタイムゾーンで表示されるので、
    // これをYYYY-MM-DD形式の文字列に変換する
    const year = props.date.getFullYear();
    const month = String(props.date.getMonth() + 1).padStart(2, '0');
    const day = String(props.date.getDate()).padStart(2, '0');
    const localDateStr = `${year}-${month}-${day}`;
    
    // この日付にデータがあるかチェック
    const hasData = datesWithData.has(localDateStr);
    
    // 今日の日付（ローカルタイム）
    const today = new Date();
    const isToday = props.date.getDate() === today.getDate() &&
                   props.date.getMonth() === today.getMonth() &&
                   props.date.getFullYear() === today.getFullYear();
    
    // デバッグ情報の出力（今日の日付またはデータがある日付のみ）
    if (isToday || hasData) {
      console.log(`カレンダー日付チェック: ${localDateStr}, データあり: ${hasData}`, {
        dateObj: props.date,
        dateStr: localDateStr,
        hasData: hasData,
        allDatesCount: datesWithData.size
      });
    }

    return (
      <div className="relative flex items-center justify-center w-full h-full">
        {hasData && (
          <div 
            className="absolute w-12 h-12 bg-purple-400/40 rounded-full"
            style={{ filter: "blur(8px)" }}
          />
        )}
        <span className="relative z-10 text-base font-medium">{props.date.getDate()}</span>
      </div>
    );
  };

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
            <FileText className="h-6 w-6 text-[rgb(155,135,245)]" />
            <h1 className="text-xl font-semibold">Temperature Management</h1>
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

      {/* 部署名表示 */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <h2 className="cutefont text-lg font-medium text-foreground">
          部署: {departmentName}
        </h2>
      </div>

      {/* メインコンテンツ */}
      <main className="mx-auto mb-6 space-y-6 w-[95%] max-w-5xl">
        {/* 通知エリア */}
        <div className="bg-accent/30 border border-border p-4 rounded-lg animate-fadeIn">
          <p className="text-sm text-foreground">
            {facilityName && (
              <span className="font-semibold">施設「{facilityName}」</span>
            )}
            {userName && facilityName && (
              <span> - </span>
            )}
            {userName && (
              <span className="font-semibold">{userName}さん</span>
            )}
            の温度管理システムへようこそ。ここでは温度記録の管理ができます。
          </p>
        </div>

        {/* リアルタイムセンサーデータ表示 */}
        {showSensorData && sensorData.lastUpdated && (
          <div className="bg-white p-4 rounded-lg border border-border shadow-sm animate-fadeIn">
            <h3 className="text-sm font-medium mb-3 flex items-center">
              <Activity className="h-4 w-4 mr-2 text-purple-500" />
              リアルタイムセンサーデータ
              <span className="ml-auto text-xs text-gray-500">
                最終更新: {(() => {
                  // UTCタイムスタンプを取得
                  const utcDate = new Date(sensorData.lastUpdated);
                  // UTCから直接変換してJSTの現地時間として表示（UTCから9時間引く）
                  const jstDate = new Date(utcDate.getTime() - 9 * 60 * 60 * 1000);
                  return jstDate.toLocaleString();
                })()}
              </span>
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {sensorData.ahtTemp !== null && (
                <div className="bg-gradient-to-br from-red-50 to-orange-50 p-3 rounded-lg border border-red-100">
                  <div className="text-xs text-gray-500 mb-1">AHT20 温度</div>
                  <div className="text-xl font-semibold text-red-600">{sensorData.ahtTemp.toFixed(1)}℃</div>
                </div>
              )}
              
              {sensorData.bmpTemp !== null && (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 p-3 rounded-lg border border-amber-100">
                  <div className="text-xs text-gray-500 mb-1">BMP280 温度</div>
                  <div className="text-xl font-semibold text-amber-600">{sensorData.bmpTemp.toFixed(1)}℃</div>
                </div>
              )}
              
              {sensorData.ahtHum !== null && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-3 rounded-lg border border-blue-100">
                  <div className="text-xs text-gray-500 mb-1">AHT20 湿度</div>
                  <div className="text-xl font-semibold text-blue-600">{sensorData.ahtHum.toFixed(1)}%</div>
                </div>
              )}
              
              {sensorData.bmpPres !== null && (
                <div className="bg-gradient-to-br from-indigo-50 to-violet-50 p-3 rounded-lg border border-indigo-100">
                  <div className="text-xs text-gray-500 mb-1">BMP280 気圧</div>
                  <div className="text-xl font-semibold text-indigo-600">{sensorData.bmpPres.toFixed(1)}hPa</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* カレンダー */}
        <div className="bg-white p-4 rounded-lg border border-border text-black">
          <style 
            dangerouslySetInnerHTML={{
              __html: `
              .rdp {
                --rdp-cell-size: 70px !important;
                --rdp-accent-color: rgba(147, 51, 234, 0.2);
                --rdp-background-color: rgba(147, 51, 234, 0.1);
                margin: 0;
                width: 100%;
              }
              .rdp-months {
                justify-content: space-around;
                width: 100%;
              }
              .rdp-month {
                width: 100%;
              }
              .rdp-table {
                width: 100%;
                max-width: none;
              }
              .rdp-caption {
                padding: 0 0 1.5rem 0;
              }
              .rdp-cell {
                height: var(--rdp-cell-size);
                width: var(--rdp-cell-size);
                padding: 0;
              }
            `
            }}
          />
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border w-full max-w-none"
            components={{ DayContent: CustomDayContent }}
            modifiers={{ today: new Date() }}
            modifiersStyles={{
              today: {
                color: "rgb(255,69,0)",
                fontWeight: "bold",
                backgroundColor: "#f3f4f6"
              }
            }}
          />
        </div>

        {/* 新規登録ボタン */}
        <div className="flex justify-end gap-4">
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={() => {
                router.push(`/temperature/sensor-data?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`);
              }}
              className="bg-gradient-to-r from-blue-400 to-indigo-500 hover:from-blue-500 hover:to-indigo-600 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Activity className="h-5 w-5 mr-2" />
              センサーデータ履歴
            </Button>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={() => {
                window.location.href = `/temperature/new?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`;
              }}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow hover:bg-primary/90 h-9 px-4 w-full bg-gradient-to-r from-pink-300 to-purple-400 hover:from-pink-300 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add New Temperature Record
            </Button>
          </motion.div>
        </div>

        {/* データリスト */}
        <div className="bg-white rounded-lg border border-border overflow-x-auto">
          {/* フィルターコントロール */}
          <div className="p-4 border-b border-border bg-secondary/20 flex justify-between items-center">
            <h3 className="text-lg font-medium">温度記録一覧</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAutoRecords}
                  onChange={(e) => setIncludeAutoRecords(e.target.checked)}
                  className="sr-only peer"
                />
                <span className="relative inline-flex items-center h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-blue-500 transition-colors">
                  <span className="inline-block w-4 h-4 transform translate-x-0.5 bg-white rounded-full transition-transform peer-checked:translate-x-4.5"></span>
                </span>
                <span className="ml-2 text-sm text-gray-700">
                  自動記録データを含める
                </span>
              </label>
            </div>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="mt-4 text-gray-500">データを読み込み中...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-2" />
              <p>{includeAutoRecords ? 'データがありません' : '手動記録データがありません'}</p>
              {!includeAutoRecords && (
                <p className="mt-2 text-sm">
                  <button 
                    onClick={() => setIncludeAutoRecords(true)}
                    className="text-blue-500 hover:underline"
                  >
                    自動記録データを含める
                  </button> と表示されるかもしれません
                </p>
              )}
            </div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                    Date
                  </th>
                  {temperatureItems.map((item) => (
                    <th
                      key={item.id}
                      className="px-4 py-3 text-center text-sm font-medium text-foreground"
                    >
                      {item.display_name || item.item_name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-sm font-medium text-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      {new Date(record.record_date).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                      {record.is_auto_recorded && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">自動</span>
                      )}
                    </td>
                    {temperatureItems.map((item) => {
                      const detail = record.temperature_record_details.find(
                        (d) => d.temperature_item_id === item.id
                      );
                      const rawVal = detail?.value;
                      const isSensorData = detail?.data_source === 'sensor';
                      const isCheckItem = item.item_name === "seika_samplecheck";
                      
                      return (
                        <td
                          key={`${record.id}-${item.id}`}
                          className="px-4 py-3 text-center"
                        >
                          {rawVal !== undefined && rawVal !== null ? (
                            isCheckItem ? (
                              rawVal === 1 ? (
                                <Check className="h-5 w-5 mx-auto text-green-600" />
                              ) : (
                                <X className="h-5 w-5 mx-auto text-red-600" />
                              )
                            ) : (
                              <span className={isSensorData ? "text-blue-600 font-medium" : ""}>
                                {rawVal}℃
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                          {isSensorData && !isCheckItem && (
                            <span className="ml-1 text-xs text-blue-500">●</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/temperature/record/${record.id}?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`}
                        className="text-sm text-blue-500 hover:text-blue-700"
                      >
                        表示
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
