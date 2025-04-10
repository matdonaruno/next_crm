"use client";

import { Calendar } from "@/components/ui/calendar";
import { Bell, Plus, FileText, ChevronLeft, Home, Check, X, Activity, ThermometerSnowflake, Battery, BatteryMedium, BatteryLow, BatteryWarning, BatteryFull, Thermometer, Droplets, Gauge } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DayContentProps } from "react-day-picker";
import { getCachedFacility, cacheFacility } from "@/lib/facilityCache";
import { getCurrentUser } from "@/lib/userCache";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSimpleAuth } from "@/hooks/useSimpleAuth";
import { useSessionCheck } from "@/hooks/useSessionCheck";
import { AppHeader } from "@/components/ui/app-header";

interface TemperatureRecordDetail {
  id: string;
  temperature_item_id: string;
  value: number;
  data_source?: string; // 'manual'または'sensor'
}

interface TemperatureRecord {
  id: string;
  record_date: string; // UTCタイムスタンプ (DB保存)
  created_at: string; // 作成日時
  temperature_record_details: TemperatureRecordDetail[];
  facility_id: string;
  is_auto_recorded?: boolean; // 自動記録されたかどうか
}

interface TemperatureItem {
  id: string;
  item_name: string;       // 例: "冷蔵庫1" の実際の英名
  display_name: string;    // 画面表示名
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
  batteryVolt: number | null; // バッテリー電圧
  lastUpdated: string | null; // ISO文字列(UTC)
}

// センサーデバイス情報を定義
interface SensorDevice {
  id: string;
  device_name: string;
  device_id: string;
  location: string;
  department_id: string;
  facility_id: string;
  status: string; // is_activeの代わり
}

// デバイスのバッテリー情報
interface DeviceBatteryInfo {
  deviceId: string;
  deviceName: string;
  location: string;
  batteryVolt: number | null;
  lastUpdated: string | null;
}

// バッテリーレベルの列挙型
enum BatteryLevel {
  HIGH = "high",
  MIDDLE = "middle",
  LOW = "low",
  WARNING = "warning",
  UNKNOWN = "unknown",
}

// 通知の型定義を拡張
interface Notification {
  id: number;
  type: string;
  message: string;
  timestamp: Date;
  priority?: "low" | "medium" | "high";
}

// 期間選択のための型定義
type DateRange = "1week" | "2weeks" | "1month" | "3months" | "all";

// バッテリーアイコンコンポーネント
const BatteryIcon = ({ level }: { level: BatteryLevel }) => {
  switch (level) {
    case BatteryLevel.HIGH:
      return <BatteryFull className="h-5 w-5 text-green-500" />;
    case BatteryLevel.MIDDLE:
      return <BatteryMedium className="h-5 w-5 text-lime-500" />;
    case BatteryLevel.LOW:
      return <BatteryLow className="h-5 w-5 text-amber-500" />;
    case BatteryLevel.WARNING:
      return <BatteryWarning className="h-5 w-5 text-rose-500" />;
    default:
      return <Battery className="h-5 w-5 text-gray-400" />;
  }
};

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
  const [dateRange, setDateRange] = useState<DateRange>("2weeks");
  const [includeAutoRecords, setIncludeAutoRecords] = useState<boolean>(true);

  // ページネーション用の状態
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalItems, setTotalItems] = useState<number>(0);

  // 通知データ
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: "warning",
      message: "温度計の校正が今月末に予定されています",
      timestamp: new Date(),
      priority: "medium",
    },
    {
      id: 2,
      type: "info",
      message: "冷蔵庫3の温度が安定しません。確認してください。",
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      priority: "medium",
    },
  ]);

  // センサーデータ
  const [showSensorData, setShowSensorData] = useState(true);
  const [sensorData, setSensorData] = useState<SensorData>({
    ahtTemp: null,
    bmpTemp: null,
    ahtHum: null,
    bmpPres: null,
    batteryVolt: null,
    lastUpdated: "",
  });

  // 複数デバイスのバッテリー情報
  const [allDevices, setAllDevices] = useState<SensorDevice[]>([]);
  const [deviceBatteryInfo, setDeviceBatteryInfo] = useState<DeviceBatteryInfo[]>([]);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // シンプル認証
  const { user, loading: authLoading } = useSimpleAuth();

  // このページではセッション確認を無効化
  useSessionCheck(false, []);

  // 未ログインなら /loginへ
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // ====== レコード・温度項目データの取得 ======
  useEffect(() => {
    if (!departmentId) return;

    const fetchItems = async () => {
      setLoading(true);
      try {
        const userProfile = await getCurrentUser();
        if (userProfile && userProfile.fullname) {
          setUserName(userProfile.fullname);
        }

        // 施設情報をキャッシュから or DBから取得
        const cached = getCachedFacility();
        if (cached && cached.id) {
          setFacilityId(cached.id);
          setFacilityName(cached.name || "");

          // temperature_items 取得
          const { data, error } = await supabase
            .from("temperature_items")
            .select("id, item_name, display_name, default_value, display_order, department_id, facility_id")
            .eq("department_id", departmentId)
            .eq("facility_id", cached.id)
            .order("display_order", { ascending: true });

          if (!error && data) {
            setTemperatureItems(data);
          }
          // レコード取得
          fetchRecords(cached.id);
          return;
        }

        // キャッシュが無い場合 -> DBで取得
        if (!userProfile || !userProfile.id) {
          console.error("ユーザー情報の取得に失敗");
          setLoading(false);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("facility_id")
          .eq("id", userProfile.id)
          .single();
        if (profileError || !profileData?.facility_id) {
          console.error("施設情報の取得に失敗");
          setLoading(false);
          return;
        }

        // 施設をDBから取得
        const { data: facilityData, error: facilityError } = await supabase
          .from("facilities")
          .select("id, name")
          .eq("id", profileData.facility_id)
          .single();

        if (!facilityError && facilityData) {
          setFacilityId(facilityData.id);
          setFacilityName(facilityData.name);
          cacheFacility({ id: facilityData.id, name: facilityData.name });
        }

        const { data: itemsData } = await supabase
          .from("temperature_items")
          .select("id, item_name, display_name, default_value, display_order, department_id, facility_id")
          .eq("department_id", departmentId)
          .eq("facility_id", profileData.facility_id)
          .order("display_order", { ascending: true });

        if (itemsData) {
          setTemperatureItems(itemsData);
        }

        // レコード取得
        fetchRecords(profileData.facility_id);
      } catch (error) {
        console.error("fetchItemsエラー:", error);
      } finally {
        setLoading(false);
      }
    };

    // レコード取得 (DBがUTC, フロントでローカル表示)
    const fetchRecords = async (currentFacilityId: string) => {
      if (!currentFacilityId) return;
      setLoading(true);
      try {
        const now = new Date();
        let startDate = new Date();
        switch (dateRange) {
          case "1week":
            startDate.setDate(now.getDate() - 7);
            break;
          case "2weeks":
            startDate.setDate(now.getDate() - 14);
            break;
          case "1month":
            startDate.setMonth(now.getMonth() - 1);
            break;
          case "3months":
            startDate.setMonth(now.getMonth() - 3);
            break;
          case "all":
            startDate = new Date(0); // 1970-01-01
            break;
        }

        let query = supabase
          .from("temperature_records")
          .select(`
            id,
            record_date,
            created_at,
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
          .eq("facility_id", currentFacilityId)
          .gte("record_date", startDate.toISOString())
          .lte("record_date", now.toISOString());

        if (!includeAutoRecords) {
          query = query.eq("is_auto_recorded", false);
        }

        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;
        setRecords(data || []);
        setTotalItems(data?.length || 0);
        setCurrentPage(1); // データ更新時は1ページ目に戻る

        // 日付データをセット (UTC->JS Date->ローカル)
        const dates = new Set<string>();
        data?.forEach((record) => {
          const dateObj = new Date(record.created_at);
          // ここで +9h はしない → ユーザーのブラウザが自動変換
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getDate()).padStart(2, "0");
          const localDateStr = `${year}-${month}-${day}`;
          dates.add(localDateStr);
        });
        setDatesWithData(dates);
      } catch (error) {
        console.error("fetchRecordsエラー:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [departmentId, includeAutoRecords, dateRange]);

  // includeAutoRecordsの切り替え
  useEffect(() => {
    if (facilityId && departmentId) {
      const refetchRecords = async () => {
        setLoading(true);
        try {
          let query = supabase
            .from("temperature_records")
            .select(`
              id,
              record_date,
              created_at,
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
          const { data, error } = await query.order("created_at", { ascending: false });
          if (error) throw error;

          setRecords(data || []);
          setTotalItems(data?.length || 0);
          setCurrentPage(1); // フィルター変更時は1ページ目に戻る

          const dates = new Set<string>();
          data?.forEach((record) => {
            const dateObj = new Date(record.created_at);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, "0");
            const d = String(dateObj.getDate()).padStart(2, "0");
            dates.add(`${y}-${m}-${d}`);
          });
          setDatesWithData(dates);
        } catch (error) {
          console.error("フィルタ変更後エラー:", error);
        } finally {
          setLoading(false);
        }
      };
      refetchRecords();
    }
  }, [facilityId, departmentId, includeAutoRecords]);

  // リアルタイムセンサーデータの取得
  useEffect(() => {
    if (!facilityId || !departmentId) return;

    const fetchLatestSensorData = async () => {
      try {
        // 部門に所属するセンサーデバイスの取得
        const { data: deviceData, error: deviceError } = await supabase
          .from('sensor_devices')
          .select('id, device_name, device_id')
          .eq('facility_id', facilityId)
          .eq('department_id', departmentId)
          .eq('status', 'active')
          .limit(1);
          
        if (deviceError || !deviceData || deviceData.length === 0) {
          console.log('アクティブなセンサーデバイスが見つかりません');
          return;
        }
        
        // 最新のセンサーログを取得
        const { data: logData, error: logError } = await supabase
          .from('sensor_logs')
          .select('raw_data, recorded_at')
          .eq('sensor_device_id', deviceData[0].id)
          .order('recorded_at', { ascending: false })
          .limit(1);
          
        if (logError || !logData || logData.length === 0) {
          console.log('最新のセンサーデータが見つかりません');
          return;
        }
        
        // センサーデータを更新
        const latestLog = logData[0];
        setSensorData({
          ahtTemp: latestLog.raw_data?.ahtTemp || null,
          bmpTemp: latestLog.raw_data?.bmpTemp || null,
          ahtHum: latestLog.raw_data?.ahtHum || null,
          bmpPres: latestLog.raw_data?.bmpPres || null,
          batteryVolt: latestLog.raw_data?.batteryVolt || null,
          lastUpdated: latestLog.recorded_at
        });
      } catch (error) {
        console.error('センサーデータ取得エラー:', error);
      }
    };
    
    // 初回データ取得
    fetchLatestSensorData();
    
    // 定期的な更新（30秒ごと）
    const interval = setInterval(fetchLatestSensorData, 30 * 1000);
    
    // リアルタイム更新のサブスクリプション
    const subscription = supabase
      .channel('sensor_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_logs' }, fetchLatestSensorData)
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [facilityId, departmentId]);

  // ===== バッテリー/センサーデータ等（省略 or 既存のまま） =====
  // ... ここでは割愛

  // バッテリーレベルを計算する関数
  const getBatteryLevel = (voltage: number | null): BatteryLevel => {
    if (voltage === null) return BatteryLevel.UNKNOWN;
    
    // 電圧値に基づいてレベルを判定（3.000V-3.300Vの範囲に合わせて調整）
    if (voltage >= 3.225) return BatteryLevel.HIGH;
    if (voltage >= 3.150) return BatteryLevel.MIDDLE; 
    if (voltage >= 3.075) return BatteryLevel.LOW;
    return BatteryLevel.WARNING;
  };

  // バッテリー電圧からパーセンテージに変換する関数
  const getBatteryPercentage = (voltage: number | null): number => {
    if (voltage === null) return 0;
    
    // センサーの電圧範囲：最小 3.000V（0%）、最大 3.300V（100%）
    const minVoltage = 3.000;
    const maxVoltage = 3.300;
    
    // 電圧を0-100%の範囲に変換
    let percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
    
    // 0-100%の範囲に制限
    percentage = Math.max(0, Math.min(100, percentage));
    
    // 整数に丸める
    return Math.round(percentage);
  };

  // バッテリーレベルに応じたメッセージを取得
  const getBatteryMessage = (level: BatteryLevel): string => {
    switch(level) {
      case BatteryLevel.HIGH:
        return 'バッテリー残量は十分です';
      case BatteryLevel.MIDDLE:
        return 'バッテリー残量は半分程度です';
      case BatteryLevel.LOW:
        return 'バッテリー残量が少なくなっています。交換を検討してください';
      case BatteryLevel.WARNING:
        return '⚠️ バッテリー残量が危険レベルです。すぐに交換または充電してください';
      default:
        return 'バッテリー情報を取得できません';
    }
  };

  // ページネーション関連の処理
  const totalPages = Math.ceil(records.length / itemsPerPage);
  
  // 現在のページに表示するレコードを計算
  const paginatedRecords: TemperatureRecord[] = records.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // ページを変更する関数
  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // すべてのセンサーデバイスとそのバッテリー情報を取得する関数
  const fetchAllDevicesBatteryInfo = useCallback(async () => {
    if (!facilityId || !departmentId) {
      console.log('必要なデータが不足しています:', { facilityId, departmentId });
      return;
    }
    
    setLoadingDevices(true);
    
    try {
      console.log('すべてのセンサーデバイス情報を取得しています:', { facilityId, departmentId });
      
      // センサーデバイスを取得 - カラム名を修正
      let devicesQuery = supabase
        .from('sensor_devices')
        .select('id, device_name, device_id, location, department_id, facility_id, status')
        .eq('facility_id', facilityId);
      
      // デバッグ用に生のSQLクエリを表示
      console.log('センサーデバイスクエリ:', devicesQuery);
      
      // 部署IDが指定されている場合は絞り込み
      if (departmentId) {
        devicesQuery = devicesQuery.eq('department_id', departmentId);
        console.log('部署IDでフィルター後のクエリ:', devicesQuery);
      }
      
      const { data: devicesData, error: devicesError } = await devicesQuery;
      
      if (devicesError) {
        console.error('センサーデバイス取得エラー:', devicesError);
        setLoadingDevices(false);
        return;
      }
      
      console.log('センサーデバイス取得結果:', { 
        count: devicesData?.length || 0, 
        data: devicesData,
        facilityId,
        departmentId 
      });
      
      if (!devicesData || devicesData.length === 0) {
        console.log('この部署のセンサーデバイスが見つかりません');
        
        // フィルターを緩めて、施設全体のデバイスを確認（デバッグ用）
        console.log('施設全体のデバイスを確認中...');
        const { data: allFacilityDevices, error: allDevicesError } = await supabase
          .from('sensor_devices')
          .select('id, device_name, device_id, location, department_id, facility_id, status');
        
        if (allDevicesError) {
          console.error('施設全体のデバイス取得エラー:', allDevicesError);
        } else {
          console.log('施設全体のデバイス一覧:', allFacilityDevices);
        }
        
        setLoadingDevices(false);
        return;
      }
      
      console.log(`${devicesData.length}件のセンサーデバイスを発見:`, devicesData);
      setAllDevices(devicesData);
      
      // 各デバイスの最新バッテリー情報を取得
      const batteryInfoPromises = devicesData.map(async (device) => {
        // デバイスからの最新のセンサーログを取得
        const { data: logData, error: logError } = await supabase
          .from('sensor_logs')
          .select('raw_data, recorded_at')
          .eq('sensor_device_id', device.id)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single();
          
        if (logError) {
          console.log(`デバイス ${device.device_name} のセンサーログ取得エラー:`, logError);
          return {
            deviceId: device.id,
            deviceName: device.device_name,
            location: device.location || '未設定',
            batteryVolt: null,
            lastUpdated: null
          };
        }
        
        return {
          deviceId: device.id,
          deviceName: device.device_name,
          location: device.location || '未設定',
          batteryVolt: logData.raw_data.batteryVolt || null,
          lastUpdated: logData.recorded_at
        };
      });
      
      const batteryInfoResults = await Promise.all(batteryInfoPromises);
      setDeviceBatteryInfo(batteryInfoResults);
      console.log('すべてのデバイスバッテリー情報を取得しました:', batteryInfoResults);
      
    } catch (error) {
      console.error('デバイスバッテリー情報取得エラー:', error);
    } finally {
      setLoadingDevices(false);
    }
  }, [facilityId, departmentId]);

  // カレンダーの日付にデータがあるかどうか
  const CustomDayContent = (props: DayContentProps) => {
    const year = props.date.getFullYear();
    const month = String(props.date.getMonth() + 1).padStart(2, "0");
    const day = String(props.date.getDate()).padStart(2, "0");
    const localDateStr = `${year}-${month}-${day}`;
    const hasData = datesWithData.has(localDateStr);
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
    <div className="min-h-screen w-full overflow-y-auto bg-white">
      <AppHeader 
        title="Temperature Management" 
        showBackButton={true}
        icon={<ThermometerSnowflake className="h-6 w-6 text-purple-500" />}
      />

      <div className="max-w-4xl mx-auto px-4 py-4">
        <h2 className="cutefont text-lg font-medium text-foreground">
          部署: {departmentName}
        </h2>
      </div>

      <main className="container max-w-7xl mx-auto px-4 py-6">
        {/* 通知表示などは省略 */}
        
        {/* ユーザー情報表示 */}
        <div className="bg-accent/30 border border-border p-4 rounded-lg animate-fadeIn mb-6">
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
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-pink-200 p-4 mb-6 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-purple-800">リアルタイムセンサーデータ</h3>
              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="mr-2 text-xs h-7 px-2 py-0 border-purple-200 text-purple-600 hover:bg-purple-50"
                  onClick={() => {
                    fetchAllDevicesBatteryInfo();
                    setShowBatteryModal(true);
                  }}
                >
                  <Battery className="h-3.5 w-3.5 mr-1" />
                  バッテリー残量一覧
                </Button>
                <button
                  onClick={() => setShowSensorData(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {sensorData.ahtTemp !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Thermometer className="h-5 w-5 text-rose-500 mb-1" />
                  <span className="text-xs text-gray-500">AHT20温度</span>
                  <span className="text-lg font-semibold text-rose-600">
                    {sensorData.ahtTemp.toFixed(1)}℃
                  </span>
                </div>
              )}
              
              {sensorData.bmpTemp !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Thermometer className="h-5 w-5 text-amber-500 mb-1" />
                  <span className="text-xs text-gray-500">BMP280温度</span>
                  <span className="text-lg font-semibold text-amber-600">
                    {sensorData.bmpTemp.toFixed(1)}℃
                  </span>
                </div>
              )}
              
              {sensorData.ahtHum !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Droplets className="h-5 w-5 text-blue-500 mb-1" />
                  <span className="text-xs text-gray-500">AHT20湿度</span>
                  <span className="text-lg font-semibold text-blue-600">
                    {sensorData.ahtHum.toFixed(1)}%
                  </span>
                </div>
              )}
              
              {sensorData.bmpPres !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Gauge className="h-5 w-5 text-teal-500 mb-1" />
                  <span className="text-xs text-gray-500">BMP280気圧</span>
                  <span className="text-lg font-semibold text-teal-600">
                    {sensorData.bmpPres.toFixed(1)}hPa
                  </span>
                </div>
              )}
              
              {/* バッテリー情報表示 */}
              {sensorData.batteryVolt !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Battery className="h-5 w-5 text-purple-500 mb-1" />
                  <span className="text-xs text-gray-500">バッテリー残量</span>
                  <span className="text-lg font-semibold text-purple-600">
                    {getBatteryPercentage(sensorData.batteryVolt)}%
                  </span>
                  
                  {/* バッテリー残量のプログレスバー */}
                  <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.HIGH 
                          ? 'bg-green-500'
                          : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.MIDDLE
                            ? 'bg-lime-500'
                            : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.LOW
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                      }`}
                      style={{ width: `${getBatteryPercentage(sensorData.batteryVolt)}%` }}
                    ></div>
                  </div>
                  
                  <div className="text-xs text-center mt-1">
                    {getBatteryMessage(getBatteryLevel(sensorData.batteryVolt))}
                  </div>
                  <div className="text-xs text-gray-500">
                    {sensorData.batteryVolt.toFixed(3)}V
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-2 text-right text-xs text-gray-500">
              最終更新: {sensorData.lastUpdated ? (() => {
                // より堅牢な方法でUTCのまま表示
                const updateDate = new Date(sensorData.lastUpdated);
                // UTCのままの日時を取得
                const year = updateDate.getUTCFullYear();
                const month = String(updateDate.getUTCMonth() + 1).padStart(2, '0');
                const day = String(updateDate.getUTCDate()).padStart(2, '0');
                const hours = String(updateDate.getUTCHours()).padStart(2, '0');
                const minutes = String(updateDate.getUTCMinutes()).padStart(2, '0');
                
                // yyyy/MM/dd HH:mm形式で返す（UTCのまま、秒を切り捨て）
                return `${year}/${month}/${day} ${hours}:${minutes}`;
              })() : '未取得'}
            </div>
          </div>
        )}

        {/* カレンダー */}
        <div className="bg-white p-4 rounded-lg border border-border text-black mb-6">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border w-full max-w-none"
            components={{ DayContent: CustomDayContent }}
          />
        </div>

        {/* 新規登録ボタン */}
        <div className="flex justify-end gap-4 my-6">
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              onClick={() => {
                router.push(`/temperature/sensor-data?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`);
              }}
              className="bg-gradient-to-r from-blue-300 to-purple-300 hover:from-blue-400 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Activity className="h-5 w-5 mr-2" />
              センサーデータ履歴
            </Button>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="mt-4 md:mt-0"
          >
            <Button
              onClick={() => {
                window.location.href = `/temperature/new?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`;
              }}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow hover:bg-primary/90 h-9 px-4 w-full bg-gradient-to-r from-pink-300 to-purple-400 hover:from-pink-300 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Plus className="mr-2 h-5 w-5" />
              新規温度記録
            </Button>
          </motion.div>
        </div>

        {/* フィルタ (期間/自動記録) */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-secondary/20 border border-border p-4 rounded-md mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-medium">温度記録一覧</h3>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="1week">1週間</option>
              <option value="2weeks">2週間</option>
              <option value="1month">1ヶ月</option>
              <option value="3months">3ヶ月</option>
              <option value="all">すべて</option>
            </select>
          </div>
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

        {/* レコード表示 */}
        <div className="bg-white rounded-lg border border-border overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="mt-4 text-gray-500">データを読み込み中...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>{includeAutoRecords ? "データがありません" : "手動記録データがありません"}</p>
              {!includeAutoRecords && (
                <p className="mt-2 text-sm">
                  <button
                    onClick={() => setIncludeAutoRecords(true)}
                    className="text-blue-500 hover:underline"
                  >
                    自動記録データを含める
                  </button>
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
                {paginatedRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      {(() => {
                        // より堅牢な方法でUTCのまま表示
                        const recordDate = new Date(record.created_at);
                        // UTCのままの日時を取得
                        const year = recordDate.getUTCFullYear();
                        const month = String(recordDate.getUTCMonth() + 1).padStart(2, '0');
                        const day = String(recordDate.getUTCDate()).padStart(2, '0');
                        const hours = String(recordDate.getUTCHours()).padStart(2, '0');
                        const minutes = String(recordDate.getUTCMinutes()).padStart(2, '0');
                        
                        // yyyy/MM/dd HH:mm形式で返す（UTCのまま、秒を切り捨て）
                        return `${year}/${month}/${day} ${hours}:${minutes}`;
                      })()}
                      {record.is_auto_recorded && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                          自動
                        </span>
                      )}
                    </td>
                    {temperatureItems.map((item) => {
                      const detail = record.temperature_record_details.find(
                        (d) => d.temperature_item_id === item.id
                      );
                      const rawVal = detail?.value;
                      const isSensorData = detail?.data_source === "sensor";

                      // 例) 検体チェックなど(温度じゃない)
                      const isCheckItem = item.item_name === "検体チェック"; 

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
                              <span
                                className={isSensorData ? "text-blue-600 font-medium" : ""}
                              >
                                {rawVal}℃
                                {isSensorData && (
                                  <span className="ml-1 text-xs text-blue-500">●</span>
                                )}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400">-</span>
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
        
        {/* ページングコントロール */}
        {totalItems > 0 && (
          <div className="bg-white p-4 rounded-lg border border-border shadow-sm mt-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="text-sm text-gray-500">
                {totalItems} 件中 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} 件を表示
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">表示件数:</label>
                <select 
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1); // 表示件数変更時は1ページ目に戻る
                  }}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                >
                  <option value="10">10件</option>
                  <option value="20">20件</option>
                  <option value="50">50件</option>
                </select>
              </div>
              
              <nav className="inline-flex rounded-md shadow">
                <button
                  onClick={() => handlePageChange(1)}
                  className="px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === 1}
                >
                  最初
                </button>
                
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="px-3 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === 1}
                >
                  前へ
                </button>
                
                {/* ページ番号 */}
                <div className="flex">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // 表示するページ番号の計算
                    // 現在のページを中心に最大5つのページ番号を表示
                    let pageNum = currentPage - 2 + i;
                    
                    // 最初のページから表示する場合の調整
                    if (currentPage < 3) {
                      pageNum = i + 1;
                    }
                    
                    // 最後のページから表示する場合の調整
                    if (currentPage > totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    }
                    
                    // 有効なページ番号のみ表示
                    if (pageNum > 0 && pageNum <= totalPages) {
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-2 border-t border-b border-gray-300 text-sm font-medium ${
                            pageNum === currentPage
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="px-3 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === totalPages}
                >
                  次へ
                </button>
                
                <button
                  onClick={() => handlePageChange(totalPages)}
                  className="px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  disabled={currentPage === totalPages}
                >
                  最後
                </button>
              </nav>
            </div>
          </div>
        )}
      </main>
      
      {/* バッテリー情報モーダル */}
      <AnimatePresence>
        {showBatteryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl p-5 w-full max-w-2xl mx-4 shadow-xl"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold flex items-center">
                  <Battery className="mr-2 h-5 w-5 text-purple-500" />
                  センサーデバイスバッテリー状況
                </h2>
                <button
                  onClick={() => setShowBatteryModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingDevices ? (
                <div className="py-8 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto"></div>
                  <p className="mt-4 text-gray-500">デバイス情報を読み込み中...</p>
                </div>
              ) : deviceBatteryInfo.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Battery className="h-16 w-16 text-gray-300 mx-auto mb-2" />
                  <p>センサーデバイスが見つかりません</p>
                </div>
              ) : (
                <>
                  <div className="overflow-auto max-h-96 -mx-5 px-5">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                            デバイス名
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                            設置場所
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                            バッテリー残量
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                            最終更新
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {deviceBatteryInfo.map((device) => (
                          <tr key={device.deviceId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center">
                                <BatteryIcon level={getBatteryLevel(device.batteryVolt)} />
                                <span className="ml-2 font-medium">
                                  {device.deviceName}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                              {device.location}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {device.batteryVolt !== null ? (
                                <div className="flex flex-col items-center">
                                  <div className={`text-sm font-semibold ${
                                    getBatteryLevel(device.batteryVolt) === BatteryLevel.HIGH 
                                      ? 'text-green-600'
                                      : getBatteryLevel(device.batteryVolt) === BatteryLevel.MIDDLE
                                        ? 'text-lime-600'
                                        : getBatteryLevel(device.batteryVolt) === BatteryLevel.LOW
                                          ? 'text-amber-600'
                                          : 'text-rose-600'
                                  }`}>
                                    {getBatteryPercentage(device.batteryVolt)}%
                                  </div>
                                  
                                  {/* バッテリー残量プログレスバー */}
                                  <div className="w-24 h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        getBatteryLevel(device.batteryVolt) === BatteryLevel.HIGH 
                                          ? 'bg-green-500'
                                          : getBatteryLevel(device.batteryVolt) === BatteryLevel.MIDDLE
                                            ? 'bg-lime-500'
                                            : getBatteryLevel(device.batteryVolt) === BatteryLevel.LOW
                                              ? 'bg-amber-500'
                                              : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${getBatteryPercentage(device.batteryVolt)}%` }}
                                    ></div>
                                  </div>
                                  
                                  <span className="text-xs text-gray-500 mt-1">
                                    {device.batteryVolt.toFixed(3)}V
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">データなし</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">
                              {device.lastUpdated ? (
                                (() => {
                                  // より堅牢な方法でUTCのまま表示
                                  const recordedAt = new Date(device.lastUpdated);
                                  // UTCのままの日時を取得
                                  const year = recordedAt.getUTCFullYear();
                                  const month = String(recordedAt.getUTCMonth() + 1).padStart(2, '0');
                                  const day = String(recordedAt.getUTCDate()).padStart(2, '0');
                                  const hours = String(recordedAt.getUTCHours()).padStart(2, '0');
                                  const minutes = String(recordedAt.getUTCMinutes()).padStart(2, '0');
                                  
                                  // yyyy/MM/dd HH:mm形式で返す（UTCのまま、秒を切り捨て）
                                  return `${year}/${month}/${day} ${hours}:${minutes}`;
                                })()
                              ) : (
                                '未取得'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={fetchAllDevicesBatteryInfo}
                      className="mr-2 bg-purple-100 hover:bg-purple-200 text-purple-800 border-none"
                    >
                      <Activity className="h-4 w-4 mr-1" />
                      更新
                    </Button>
                    <Button
                      onClick={() => setShowBatteryModal(false)}
                      variant="outline"
                    >
                      閉じる
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
