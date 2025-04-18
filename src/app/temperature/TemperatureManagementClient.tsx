"use client";

import { Calendar } from "@/components/ui/calendar";
import { Bell, Plus, FileText, ChevronLeft, Home, Check, X, Activity, ThermometerSnowflake, Battery, BatteryMedium, BatteryLow, BatteryWarning, BatteryFull, Thermometer, Droplets, Gauge, FileCheck, AlertTriangle, Info } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import { DayContentProps } from "react-day-picker";
import { getCachedFacility, cacheFacility } from "@/lib/facilityCache";
import { getCurrentUser } from "@/lib/userCache";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSimpleAuth } from "@/hooks/useSimpleAuth";
import { useSessionCheck } from "@/hooks/useSessionCheck";
import { AppHeader } from "@/components/ui/app-header";
import { VerificationStatus } from "@/components/temperature/verification-status";
import { IncidentList } from '@/components/temperature/incident-log/incident-list';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ThermometerIcon } from "lucide-react";

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

// 日時のフォーマットを行う関数
const formatDateForDisplay = (dateString: string) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    // UTCのままの日時を取得
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    
    // yyyy/MM/dd HH:mm形式で返す（UTCのまま、秒を切り捨て）
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  } catch (e) {
    console.error('Date formatting error:', e);
    return dateString; // フォールバック
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
      message: "温度計の校正が今月末に予定されています (デモ用)",
      timestamp: new Date(),
      priority: "medium",
    },
    {
      id: 2,
      type: "info",
      message: "冷蔵庫3の温度が安定しません。確認してください。 (デモ用)",
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      priority: "medium",
    },
  ]);

  // 平均値と標準偏差の計算用の状態を追加
  const [tempStatistics, setTempStatistics] = useState({
    ahtTempMean: null as number | null,
    ahtTempSD: null as number | null,
    bmpTempMean: null as number | null,
    bmpTempSD: null as number | null,
    lastCalculated: null as Date | null
  });

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

    // 過去データから統計情報を計算する関数
    const calculateTemperatureStatistics = async () => {
      try {
        // センサーデバイスの取得
        const { data: deviceData } = await supabase
          .from('sensor_devices')
          .select('id')
          .eq('facility_id', facilityId)
          .eq('department_id', departmentId)
          .eq('status', 'active')
          .limit(1);

        if (!deviceData || deviceData.length === 0) return;

        // 過去24時間のデータを取得
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);

        const { data: logs } = await supabase
          .from('sensor_logs')
          .select('raw_data')
          .eq('sensor_device_id', deviceData[0].id)
          .gte('recorded_at', oneDayAgo.toISOString());

        if (!logs || logs.length === 0) return;

        // AHT温度の統計計算
        const ahtTemps = logs
          .map(log => log.raw_data?.ahtTemp)
          .filter(temp => temp !== null && temp !== undefined) as number[];

        // BMP温度の統計計算
        const bmpTemps = logs
          .map(log => log.raw_data?.bmpTemp)
          .filter(temp => temp !== null && temp !== undefined) as number[];

        if (ahtTemps.length > 0) {
          const ahtMean = ahtTemps.reduce((sum, temp) => sum + temp, 0) / ahtTemps.length;
          const ahtSD = Math.sqrt(
            ahtTemps.reduce((sum, temp) => sum + Math.pow(temp - ahtMean, 2), 0) / ahtTemps.length
          );

          const bmpMean = bmpTemps.length > 0 
            ? bmpTemps.reduce((sum, temp) => sum + temp, 0) / bmpTemps.length 
            : null;
          const bmpSD = bmpTemps.length > 0 
            ? Math.sqrt(bmpTemps.reduce((sum, temp) => sum + Math.pow(temp - bmpMean!, 2), 0) / bmpTemps.length)
            : null;

          console.log("温度統計計算完了:", {
            ahtMean: ahtMean.toFixed(2),
            ahtSD: ahtSD.toFixed(2),
            ahtSamples: ahtTemps.length,
            bmpMean: bmpMean?.toFixed(2) || "N/A",
            bmpSD: bmpSD?.toFixed(2) || "N/A",
            bmpSamples: bmpTemps.length
          });

          setTempStatistics({
            ahtTempMean: ahtMean,
            ahtTempSD: ahtSD,
            bmpTempMean: bmpMean,
            bmpTempSD: bmpSD,
            lastCalculated: new Date()
          });
        }
      } catch (error) {
        console.error('温度統計計算エラー:', error);
      }
    };

    // 温度が管理幅を超えたかをチェックする関数
    const checkTemperatureAlerts = (sensorData: any) => {
      if (!tempStatistics.ahtTempMean || !tempStatistics.ahtTempSD) return;
      
      // 管理幅の計算（平均値±2SD）
      const ahtUpperLimit = tempStatistics.ahtTempMean + 2 * tempStatistics.ahtTempSD;
      const ahtLowerLimit = tempStatistics.ahtTempMean - 2 * tempStatistics.ahtTempSD;
      
      // 現在値と管理幅比較（AHT温度センサー）
      if (sensorData.ahtTemp !== null) {
        if (sensorData.ahtTemp > ahtUpperLimit || sensorData.ahtTemp < ahtLowerLimit) {
          // 管理幅を超えた場合は通知を追加
          const newNotification: Notification = {
            id: Date.now(),
            type: "warning",
            message: `AHT20温度センサー: ${sensorData.ahtTemp.toFixed(1)}℃が管理幅(${ahtLowerLimit.toFixed(1)}℃～${ahtUpperLimit.toFixed(1)}℃)を超えました。`,
            timestamp: new Date(),
            priority: "high"
          };
          
          // 重複通知を防止（同じメッセージがある場合は追加しない）
          if (!notifications.some(n => n.message === newNotification.message)) {
            // UI通知を追加
            setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // 最大10件まで
            
            // データベースに通知を保存
            saveNotificationToDatabase(newNotification);
            
            // Slackにも通知を送信
            sendSlackNotification(newNotification);
          }
        }
      }
      
      // BMP温度センサーの管理幅チェック
      if (tempStatistics.bmpTempMean && tempStatistics.bmpTempSD && sensorData.bmpTemp !== null) {
        const bmpUpperLimit = tempStatistics.bmpTempMean + 2 * tempStatistics.bmpTempSD;
        const bmpLowerLimit = tempStatistics.bmpTempMean - 2 * tempStatistics.bmpTempSD;
        
        if (sensorData.bmpTemp > bmpUpperLimit || sensorData.bmpTemp < bmpLowerLimit) {
          const newNotification: Notification = {
            id: Date.now() + 1, // ユニークIDを確保
            type: "warning",
            message: `BMP280温度センサー: ${sensorData.bmpTemp.toFixed(1)}℃が管理幅(${bmpLowerLimit.toFixed(1)}℃～${bmpUpperLimit.toFixed(1)}℃)を超えました。`,
            timestamp: new Date(),
            priority: "high"
          };
          
          // 重複通知を防止
          if (!notifications.some(n => n.message === newNotification.message)) {
            // UI通知を追加
            setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // 最大10件まで
            
            // データベースに通知を保存
            saveNotificationToDatabase(newNotification);
            
            // Slackにも通知を送信
            sendSlackNotification(newNotification);
          }
        }
      }
    };

    // データベースに通知を保存する関数
    const saveNotificationToDatabase = async (notification: Notification) => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user?.id) return;
        
        await supabase.from('user_notifications').insert({
          user_id: data.user.id,
          title: '温度異常アラート',
          message: notification.message,
          notification_type: 'temperature_alert',
          related_data: {
            timestamp: notification.timestamp.toISOString()
          }
        });
        
        console.log('温度異常通知を保存しました');
      } catch (error) {
        console.error('通知保存エラー:', error);
      }
    };

    // Slack通知を送信する関数
    const sendSlackNotification = async (notification: Notification) => {
      try {
        console.log('Slack通知を送信開始:', notification.message);
        
        const response = await fetch('/api/slack-notification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: '温度異常アラート',
            message: notification.message,
            type: notification.type
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Slack通知送信エラー:', errorText);
        return;
      }
      
        console.log('Slack通知を送信しました');
      } catch (error) {
        console.error('Slack通知送信処理エラー:', error);
      }
    };

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
        
        // 統計データがあれば異常チェック
        if (tempStatistics.ahtTempMean !== null) {
          checkTemperatureAlerts(latestLog.raw_data);
        }
    } catch (error) {
      console.error('センサーデータ取得エラー:', error);
    }
    };
  
    // 初回統計計算
    calculateTemperatureStatistics();

    // 初回データ取得
    fetchLatestSensorData();

    // 6時間ごとに統計を再計算
    const statsInterval = setInterval(calculateTemperatureStatistics, 6 * 60 * 60 * 1000);
    
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
      clearInterval(statsInterval);
    };
  }, [facilityId, departmentId, notifications]);

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
    
    console.log(`Date ${localDateStr}: hasData = ${hasData}`, Array.from(datesWithData));
    
    return (
      <div className="relative flex items-center justify-center w-full h-full">
        {hasData ? (
          <div 
            className="absolute w-12 h-12 bg-purple-400/40 rounded-full"
            style={{ filter: "blur(8px)" }}
          />
        ) : null}
        <span className={`relative z-10 text-base ${hasData ? "font-semibold" : "font-medium"}`}>{props.date.getDate()}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title={`${departmentName}の温度管理`} showBackButton={true} />

      <div className="max-w-6xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">{departmentName}の温度管理</h1>
          <p className="text-gray-600">
            施設: {facilityName} | ユーザー: {userName}
          </p>
      </div>

        {/* 通知表示 */}
        {notifications.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold flex items-center">
              <Bell className="h-5 w-5 mr-2 text-yellow-500" />
              通知 ({notifications.length})
            </h2>
            <ul className="mt-2 space-y-2">
                {notifications.map((notification) => (
                  <li 
                  key={notification.id}
                  className={`p-2 rounded-md ${
                    notification.priority === "high"
                      ? "bg-red-50 border-l-4 border-red-400"
                      : notification.priority === "medium"
                      ? "bg-yellow-50 border-l-4 border-yellow-400"
                      : "bg-blue-50 border-l-4 border-blue-400"
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{notification.message}</span>
                    <span className="text-xs text-gray-500">
                      {notification.timestamp ? formatDateForDisplay(notification.timestamp.toISOString()) : ''}
                    </span>
                  </div>
                  </li>
                ))}
              </ul>
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-3 mb-6">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => setShowSensorData(!showSensorData)}
              className="bg-gradient-to-r from-blue-300 to-indigo-400 hover:from-blue-400 hover:to-indigo-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <ThermometerSnowflake className="h-5 w-5 mr-2 text-blue-100" />
              センサーデータ {showSensorData ? '非表示' : '表示'}
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => router.push(`/temperature/weekly-verification?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}&facilityId=${facilityId}`)}
              className="bg-gradient-to-r from-indigo-300 to-purple-400 hover:from-indigo-400 hover:to-purple-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <FileCheck className="h-5 w-5 mr-2 text-indigo-100" />
              週次温度確認
            </Button>
          </motion.div>

          {/* 月次温度確認ボタン - 管理者のみ表示 */}
          {user && (user.role === 'admin' || user.role === 'facility_admin' || user.role === 'superuser') && (
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => router.push(`/temperature/monthly-verification?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}&facilityId=${facilityId}`)}
                className="bg-gradient-to-r from-orange-300 to-red-300 hover:from-orange-400 hover:to-red-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
              >
                <Calendar className="h-5 w-5 mr-2 text-orange-100" />
                月次温度確認
              </Button>
            </motion.div>
          )}

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => router.push(`/temperature/sensor-data?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`)}
              className="bg-gradient-to-r from-purple-300 to-pink-400 hover:from-purple-400 hover:to-pink-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Activity className="h-5 w-5 mr-2 text-purple-100" />
              センサーデータ履歴
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => router.push(`/temperature/record?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`)}
              className="bg-gradient-to-r from-pink-300 to-rose-400 hover:from-pink-400 hover:to-rose-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Plus className="h-5 w-5 mr-2 text-pink-100" />
              新規温度記録
            </Button>
          </motion.div>
        </div>

        {/* 週次確認状況コンポーネント */}
        <div className="mb-6">
          <VerificationStatus 
            facilityId={facilityId} 
            departmentId={departmentId} 
            departmentName={departmentName} 
          />
        </div>

        {/* 温度異常対応履歴 */}
        <div className="mb-6">
          <IncidentList
            facilityId={facilityId}
            departmentId={departmentId}
            departmentName={departmentName}
            userId={user?.id || ""}
          />
        </div>

        {/* センサーデータ表示 */}
        {showSensorData && (
          <div className="bg-white p-4 rounded-lg border text-black">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
              リアルタイムセンサーデータ
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSensorData(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {sensorData.ahtTemp !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Thermometer className="h-5 w-5 text-rose-500 mb-1" />
                  <span className="text-xs text-gray-500">AHT20温度</span>
                  <span className={`text-lg font-semibold ${
                    tempStatistics.ahtTempMean !== null && tempStatistics.ahtTempSD !== null &&
                    (sensorData.ahtTemp > (tempStatistics.ahtTempMean + 2 * tempStatistics.ahtTempSD) ||
                     sensorData.ahtTemp < (tempStatistics.ahtTempMean - 2 * tempStatistics.ahtTempSD))
                      ? 'text-red-600 animate-pulse' 
                      : 'text-rose-600'
                  }`}>
                    {sensorData.ahtTemp.toFixed(1)}℃
                  </span>
                  {tempStatistics.ahtTempMean !== null && tempStatistics.ahtTempSD !== null && (
                    <span className="text-xs text-gray-500 mt-1">
                      管理幅: {(tempStatistics.ahtTempMean - 2 * tempStatistics.ahtTempSD).toFixed(1)}
                      〜{(tempStatistics.ahtTempMean + 2 * tempStatistics.ahtTempSD).toFixed(1)}℃
                    </span>
                  )}
                </div>
              )}
              
              {sensorData.bmpTemp !== null && (
                <div className="bg-white rounded p-2 border border-pink-100 flex flex-col items-center">
                  <Thermometer className="h-5 w-5 text-amber-500 mb-1" />
                  <span className="text-xs text-gray-500">BMP280温度</span>
                  <span className={`text-lg font-semibold ${
                    tempStatistics.bmpTempMean !== null && tempStatistics.bmpTempSD !== null &&
                    (sensorData.bmpTemp > (tempStatistics.bmpTempMean + 2 * tempStatistics.bmpTempSD) ||
                     sensorData.bmpTemp < (tempStatistics.bmpTempMean - 2 * tempStatistics.bmpTempSD))
                      ? 'text-red-600 animate-pulse' 
                      : 'text-amber-600'
                  }`}>
                    {sensorData.bmpTemp.toFixed(1)}℃
                  </span>
                  {tempStatistics.bmpTempMean !== null && tempStatistics.bmpTempSD !== null && (
                    <span className="text-xs text-gray-500 mt-1">
                      管理幅: {(tempStatistics.bmpTempMean - 2 * tempStatistics.bmpTempSD).toFixed(1)}
                      〜{(tempStatistics.bmpTempMean + 2 * tempStatistics.bmpTempSD).toFixed(1)}℃
                    </span>
                  )}
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
              最終更新: {sensorData.lastUpdated ? formatDateForDisplay(sensorData.lastUpdated) : '未取得'}
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
                      {formatDateForDisplay(record.created_at)}
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

                      // 検体チェック項目の判定 - 正確なitem_nameを使用
                      const isCheckItem = item.item_name === "seika_samplecheck"; 
                      
                      return (
                        <td
                          key={`${record.id}-${item.id}`}
                          className="px-4 py-3 text-center"
                        >
                          {rawVal !== undefined && rawVal !== null ? (
                            isCheckItem ? (
                              rawVal === 1 ? (
                                <div className="flex items-center justify-center text-green-600">
                                  <Check className="h-5 w-5 mr-1" />
                                  <span>OK</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center text-red-600">
                                  <X className="h-5 w-5 mr-1" />
                                  <span>NG</span>
                                </div>
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
      </div>
      
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
