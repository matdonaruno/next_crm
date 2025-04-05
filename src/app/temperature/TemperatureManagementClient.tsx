'use client';

import { Calendar } from "@/components/ui/calendar";
import { Bell, Plus, FileText, ChevronLeft, Home, Check, X, Activity, ThermometerSnowflake, Battery, BatteryMedium, BatteryLow, BatteryWarning, BatteryFull } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DayContentProps } from "react-day-picker";
import { getCachedFacility, cacheFacility } from '@/lib/facilityCache';
import { getCurrentUser } from '@/lib/userCache';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSimpleAuth } from '@/hooks/useSimpleAuth';
import { useSessionCheck } from '@/hooks/useSessionCheck';
import { AppHeader } from '@/components/ui/app-header';
import { setSessionCheckEnabled } from "@/contexts/AuthContext";

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
  batteryVolt: number | null; // バッテリー電圧を追加
  lastUpdated: string | null;
}

// センサーデバイス情報を定義
interface SensorDevice {
  id: string;
  device_name: string;  
  device_id: string;
  location: string;
  department_id: string;
  facility_id: string;
  status: string;  // is_activeの代わりにstatusを使用
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
  HIGH = 'high',
  MIDDLE = 'middle',
  LOW = 'low',
  WARNING = 'warning',
  UNKNOWN = 'unknown'
}

// 通知の型定義を拡張
interface Notification {
  id: number;
  type: string;
  message: string;
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high';
}

// 期間選択のための型定義
type DateRange = '1week' | '2weeks' | '1month' | '3months' | 'all';

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
  const [dateRange, setDateRange] = useState<DateRange>('2weeks');
  const [includeAutoRecords, setIncludeAutoRecords] = useState<boolean>(false);

  // 通知データの状態
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: 'warning',
      message: '温度計の校正が今月末に予定されています',
      timestamp: new Date(),
      priority: 'medium'
    },
    {
      id: 2,
      type: 'info',
      message: '冷蔵庫3の温度が安定しません。確認してください。',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12時間前
      priority: 'medium'
    },
    {
      id: 3,
      type: 'success',
      message: '全ての温度ログが正常に記録されています',
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2日前
      priority: 'low'
    }
  ]);

  // センサーデータの状態
  const [showSensorData, setShowSensorData] = useState(true);
  const [sensorData, setSensorData] = useState<SensorData>({
    ahtTemp: null,
    bmpTemp: null,
    ahtHum: null,
    bmpPres: null,
    batteryVolt: null, // バッテリー電圧の初期値を追加
    lastUpdated: ""
  });

  // 複数デバイスのバッテリー情報
  const [allDevices, setAllDevices] = useState<SensorDevice[]>([]);
  const [deviceBatteryInfo, setDeviceBatteryInfo] = useState<DeviceBatteryInfo[]>([]);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // シンプルな認証フックを使用
  const { user, loading: authLoading } = useSimpleAuth();
  
  // このページではセッション確認を無効化
  useSessionCheck(false, []);
  
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
        console.log("レコード取得開始:", { departmentId, facilityId: currentFacilityId, includeAutoRecords, dateRange });
        
        // 日付範囲の計算
        const now = new Date();
        let startDate = new Date();
        
        switch (dateRange) {
          case '1week':
            startDate.setDate(now.getDate() - 7);
            break;
          case '2weeks':
            startDate.setDate(now.getDate() - 14);
            break;
          case '1month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case '3months':
            startDate.setMonth(now.getMonth() - 3);
            break;
          case 'all':
            startDate = new Date(0); // すべての期間
            break;
        }
        
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
          .eq("facility_id", currentFacilityId)
          .gte('record_date', startDate.toISOString())
          .lte('record_date', now.toISOString());
        
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
          // UTCタイムスタンプをJSTに変換
          const utcDate = new Date(record.record_date);
          const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
          const year = jstDate.getFullYear();
          const month = String(jstDate.getMonth() + 1).padStart(2, '0');
          const day = String(jstDate.getDate()).padStart(2, '0');
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
  }, [departmentId, includeAutoRecords, dateRange]);

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

  // バッテリーレベルを計算する関数
  const getBatteryLevel = (voltage: number | null): BatteryLevel => {
    if (voltage === null) return BatteryLevel.UNKNOWN;
    
    // 電圧値に基づいてレベルを判定（値は仮の閾値です。実際のデバイスに合わせて調整してください）
    if (voltage > 3.6) return BatteryLevel.HIGH;
    if (voltage > 3.3) return BatteryLevel.MIDDLE; 
    if (voltage > 3.0) return BatteryLevel.LOW;
    return BatteryLevel.WARNING;
  };

  // バッテリー電圧からパーセンテージに変換する関数
  const getBatteryPercentage = (voltage: number | null): number => {
    if (voltage === null) return 0;
    
    // ESP32/ESPモジュールの一般的なリチウムイオン電池の電圧範囲
    // 最小電圧: 3.0V（0%）、最大電圧: 4.2V（100%）
    const minVoltage = 3.0;
    const maxVoltage = 4.2;
    
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
      
      // センサーデータを設定（バッテリー電圧を含む）
      setSensorData({
        ahtTemp: logData.raw_data.ahtTemp || null,
        bmpTemp: logData.raw_data.bmpTemp || null,
        ahtHum: logData.raw_data.ahtHum || null,
        bmpPres: logData.raw_data.bmpPres || null,
        batteryVolt: logData.raw_data.batteryVolt || null, // バッテリー電圧を追加
        lastUpdated: logData.recorded_at
      });
      
      // バッテリーレベルを計算
      if (logData.raw_data.batteryVolt !== undefined && logData.raw_data.batteryVolt !== null) {
        const batteryLevel = getBatteryLevel(logData.raw_data.batteryVolt);
        
        // バッテリー警告レベルの場合は通知を追加
        if (batteryLevel === BatteryLevel.LOW || batteryLevel === BatteryLevel.WARNING) {
          // useRefを使わなくても、setNotificationsの関数形式を使用して安全に更新
          setNotifications(prev => {
            // 既存のバッテリー通知があるか確認
            const existingBatteryNotification = prev.find(
              n => n.type === 'battery' && n.message.includes('バッテリー')
            );
            
            // すでに通知がある場合は、既存の通知を更新せずに現状を返す
            if (existingBatteryNotification) {
              return prev;
            }
            
            // 新しい通知を追加
            return [{
              id: Date.now(),
              type: 'battery',
              message: getBatteryMessage(batteryLevel),
              timestamp: new Date(),
              priority: batteryLevel === BatteryLevel.WARNING ? 'high' : 'medium'
            }, ...prev];
          });
        }
      }
      
      console.log('センサーデータを設定しました:', {
        timestamp: logData.recorded_at,
        localTime: jstDate.toLocaleString(),
        utcTime: new Date(logData.recorded_at).toUTCString(),
        batteryVolt: logData.raw_data.batteryVolt
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
    <div className="min-h-screen w-full overflow-y-auto bg-white">
      {/* AppHeaderコンポーネントを使用 */}
      <AppHeader 
        title="Temperature Management" 
        showBackButton={true}
        icon={<ThermometerSnowflake className="h-6 w-6 text-purple-500" />}
      />

      {/* 部署名表示 */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <h2 className="cutefont text-lg font-medium text-foreground">
          部署: {departmentName}
        </h2>
      </div>

      {/* メインコンテンツ - 幅を調整 */}
      <main className="container max-w-7xl mx-auto px-4 py-6">
        {/* 通知エリア - バッテリーの警告を優先表示 */}
        {notifications.length > 0 && (
          <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md mb-6">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
              <Bell className="inline-block mr-2 h-5 w-5 text-purple-500" />
              通知 ({notifications.length}件)
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <ul className="list-disc pl-5 text-left">
                {notifications.map((notification) => (
                  <li 
                    key={`notification-${notification.id}`} 
                    className={`text-sm mb-1 ${
                      notification.type === 'battery' && notification.priority === 'high'
                        ? 'text-red-600 font-medium'
                        : notification.type === 'battery'
                          ? 'text-amber-600'
                          : 'text-foreground'
                    }`}
                  >
                    {notification.message}
                    <span className="text-xs text-muted-foreground ml-2">
                      {notification.timestamp.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 text-right">
              <Button variant="link" className="text-purple-500 text-sm p-0 h-auto">
                すべての通知を表示
              </Button>
            </div>
          </div>
        )}

        {/* ユーザー情報表示 */}
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
          <div className="bg-white p-4 rounded-lg border border-border shadow-sm animate-fadeIn mt-6">
            <h3 className="text-sm font-medium mb-3 flex items-center">
              <Activity className="h-4 w-4 mr-2 text-purple-500" />
              リアルタイムセンサーデータ
              <Button
                variant="outline"
                size="sm"
                className="ml-2 text-xs h-7 px-2 py-0 border-purple-200 text-purple-600 hover:bg-purple-50"
                onClick={() => {
                  fetchAllDevicesBatteryInfo();
                  setShowBatteryModal(true);
                }}
              >
                <Battery className="h-3.5 w-3.5 mr-1" />
                バッテリー一覧
              </Button>
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
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              
              {/* バッテリー情報表示 */}
              {sensorData.batteryVolt !== null && (
                <div className={`bg-gradient-to-br p-3 rounded-lg border ${
                  getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.HIGH 
                    ? 'from-green-50 to-emerald-50 border-green-100'
                    : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.MIDDLE
                      ? 'from-lime-50 to-green-50 border-lime-100'
                      : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.LOW
                        ? 'from-yellow-50 to-amber-50 border-yellow-100'
                        : 'from-red-50 to-rose-50 border-red-100'
                }`}>
                  <div className="text-xs text-gray-500 mb-1">バッテリー残量</div>
                  <div className={`text-xl font-semibold ${
                    getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.HIGH 
                      ? 'text-green-600'
                      : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.MIDDLE
                        ? 'text-lime-600'
                        : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.LOW
                          ? 'text-amber-600'
                          : 'text-rose-600'
                  }`}>
                    {getBatteryPercentage(sensorData.batteryVolt)}%
                    
                    {/* バッテリー残量のプログレスバー */}
                    <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
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
                    
                    <div className="text-xs font-normal mt-2 flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                        getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.HIGH 
                          ? 'bg-green-500'
                          : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.MIDDLE
                            ? 'bg-lime-500'
                            : getBatteryLevel(sensorData.batteryVolt) === BatteryLevel.LOW
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                      }`}></span>
                      {getBatteryMessage(getBatteryLevel(sensorData.batteryVolt))}
                      
                      {/* 電圧情報も小さく表示 */}
                      <span className="text-gray-500 ml-auto">{sensorData.batteryVolt.toFixed(2)}V</span>
                    </div>
                  </div>
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

        {/* データリスト */}
        <div className="bg-white rounded-lg border border-border overflow-x-auto">
          {/* フィルターコントロール */}
          <div className="p-4 border-b border-border bg-secondary/20 flex flex-wrap justify-between items-center gap-4">
            <h3 className="text-lg font-medium">温度記録一覧</h3>
            <div className="flex items-center gap-4 flex-wrap">
              {/* 期間選択 */}
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
              {/* <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-2" /> */}
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
                      {(() => {
                        // UTCタイムスタンプをJSTに変換
                        const utcDate = new Date(record.record_date);
                        const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
                        return jstDate.toLocaleString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      })()}
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
                                    {device.batteryVolt.toFixed(2)}V
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">データなし</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">
                              {device.lastUpdated ? (
                                (() => {
                                  const utcDate = new Date(device.lastUpdated);
                                  const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
                                  return jstDate.toLocaleString('ja-JP', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
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
