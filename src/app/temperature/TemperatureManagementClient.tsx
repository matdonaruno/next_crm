"use client";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Bell, Plus, Check, X, Activity, ThermometerSnowflake,
  Battery, BatteryFull, BatteryMedium, BatteryLow, BatteryWarning,
  Thermometer, Droplets, Gauge, FileCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabaseBrowser";  // ★ default と型を両取り
import type { Database } from "@/types/supabase"; // ★ Database 型をインポート
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
import { IncidentList } from "@/components/temperature/incident-log/incident-list";
import { formatJSTDateTime, formatJSTDate } from "@/lib/utils";

/* ─── Supabase Row 型 ───────────────────────────────── */
type TemperatureItem =
  Database["public"]["Tables"]["temperature_items"]["Row"];
type TemperatureRecordDetail =
  Database["public"]["Tables"]["temperature_record_details"]["Row"];
type TemperatureRecord =
  Database["public"]["Tables"]["temperature_records"]["Row"] & {
    temperature_record_details: TemperatureRecordDetail[];
  };

/* ---------- 画面用インターフェース ---------- */
interface SensorData {
  ahtTemp: number | null; bmpTemp: number | null;
  ahtHum: number | null;  bmpPres: number | null;
  batteryVolt: number | null; lastUpdated: string | null;
}
interface Notification {
  id: number; type: string; message: string; timestamp: Date;
  priority?: "low" | "medium" | "high";
}
enum BatteryLevel { HIGH="high", MIDDLE="middle", LOW="low", WARNING="warning", UNKNOWN="unknown" }
interface DeviceBatteryInfo {
  deviceId:string; deviceName:string; location:string;
  batteryVolt:number|null; lastUpdated:string|null;
}

/* ---------- util ---------- */
const formatDateForDisplay = (s: string) => {
  return formatJSTDateTime(s);
};
const getBatteryLevel = (v: number | null): BatteryLevel => {
  if (v === null) return BatteryLevel.UNKNOWN;
  if (v >= 3.225) return BatteryLevel.HIGH;
  if (v >= 3.15 ) return BatteryLevel.MIDDLE;
  if (v >= 3.075) return BatteryLevel.LOW;
  return BatteryLevel.WARNING;
};
const getBatteryPercentage = (v: number | null): number => {
  if (v === null) return 0;
  const p = ((v - 3.0) / 0.3) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
};
const getBatteryMessage = (l: BatteryLevel) =>
  ({ high:"十分です", middle:"半分程度です", low:"少なくなっています", warning:"⚠️ 危険です", unknown:"不明" } as const)[l];

/* ---------- コンポーネント ---------- */
export default function TemperatureManagementClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get("department")  || "部署未指定";
  const departmentId   = searchParams?.get("departmentId")|| "";

  /* ---------------- state ---------------- */
  const [date, setDate] = useState(new Date());
  const [includeAutoRecords, setIncludeAutoRecords] = useState(true);

  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [records, setRecords] = useState<TemperatureRecord[]>([]);
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [facilityName, setFacilityName] = useState("");
  const [facilityId,   setFacilityId]   = useState("");
  const [userName,     setUserName]     = useState("");

  const [notifications] = useState<Notification[]>([]);
  const [tempStatistics] = useState({ ahtTempMean:null, ahtTempSD:null, bmpTempMean:null, bmpTempSD:null });

  /* ページング */
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const totalPages    = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedRecords = records.slice(
    (currentPage-1)*itemsPerPage,
    currentPage*itemsPerPage
  );
  const handlePageChange = (p:number)=>{
    setCurrentPage(Math.max(1, Math.min(p,totalPages)));
  };

  /* センサー＆デバイス */
  const [sensorData, setSensorData] = useState<SensorData>({
    ahtTemp:null, bmpTemp:null, ahtHum:null, bmpPres:null, batteryVolt:null, lastUpdated:null,
  });
  const [deviceBatteryInfo, setDeviceBatteryInfo] = useState<DeviceBatteryInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showSensorData,  setShowSensorData]  = useState(false);
  const [showBatteryModal,setShowBatteryModal]= useState(false);

  /* ---------- 認証 ---------- */
  const { user, loading:authLoading } = useSimpleAuth();
  useSessionCheck();
  useEffect(()=>{ if(!authLoading && !user) router.push("/login"); },[authLoading,user,router]);

  /* ---------- 初期ロード（施設・温度データ） ---------- */
  useEffect(()=>{
    // AuthGateWrapperで認証中の場合は処理をスキップ
    if(authLoading) return;
    if(!departmentId) return;
    (async()=>{
      setLoading(true);
      try{
        /* --- ユーザー & 施設 --- */
        const up = await getCurrentUser();
        if(up?.fullname) setUserName(up.fullname);

        let currentFacilityId = getCachedFacility()?.id ?? "";
        if(!currentFacilityId && up?.id){
          const { data:prof } = await supabase.from("profiles").select("facility_id").eq("id",up.id).single();
          currentFacilityId = prof?.facility_id ?? "";
        }
        if(!currentFacilityId) return;
        setFacilityId(currentFacilityId);

        const { data:fac } = await supabase.from("facilities").select("name").eq("id",currentFacilityId).maybeSingle();
        if(fac){ setFacilityName(fac.name); cacheFacility({id:currentFacilityId,name:fac.name}); }

        /* --- 温度項目 --- */
        const { data:items } = await supabase
          .from("temperature_items")
          .select("*")
          .eq("department_id",departmentId)
          .eq("facility_id",currentFacilityId)
          .order("display_order",{ascending:true});
        setTemperatureItems(items ?? []);

        /* --- レコード --- */
        const { data:recs } = await supabase
          .from("temperature_records")
          .select("*, temperature_record_details(*)")
          .eq("department_id",departmentId)
          .eq("facility_id",currentFacilityId)
          .order("created_at",{ascending:false});
        setRecords(recs ?? []);
        setTotalItems(recs?.length ?? 0);

        /* --- カレンダーハイライト --- */
        const set = new Set<string>();
        (recs ?? []).forEach(r=>{
          const dateStr = r.created_at ?? r.record_date;
          const formattedDate = formatJSTDate(dateStr).replace(/\//g, '-').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1-$2-$3');
          const [year, month, day] = formattedDate.split('-');
          set.add(`${year}-${parseInt(month)}-${parseInt(day)}`);
        });
        setDatesWithData(set);
      }finally{ setLoading(false); }
    })();
  },[departmentId, authLoading]);

  /* ---------- センサーデータ (最新1件) ---------- */
  useEffect(()=>{
    if(authLoading) return;
    if(!facilityId) return;
    (async()=>{
      const { data } = await supabase
        .from("sensor_data")
        .select("aht_temp,bmp_temp,aht_hum,bmp_pres,battery_volt,updated_at")
        .eq("facility_id",facilityId)
        .order("updated_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      if(data){
        setSensorData({
          ahtTemp:data.aht_temp, bmpTemp:data.bmp_temp, ahtHum:data.aht_hum,
          bmpPres:data.bmp_pres, batteryVolt:data.battery_volt, lastUpdated:data.updated_at,
        });
      }
    })();
  },[facilityId, authLoading]);

  /* ---------- 全デバイスのバッテリー ---------- */
  const fetchAllDevicesBatteryInfo = async ()=>{
    if(authLoading) return;
    if(!facilityId) return;
    setLoadingDevices(true);
    try{
      const { data:devices } = await supabase
        .from("sensor_devices")
        .select("id,device_name,location")
        .eq("facility_id",facilityId);
      const list:DeviceBatteryInfo[] = [];
      for(const dev of devices ?? []){
        const { data:log } = await supabase
          .from("sensor_device_logs")
          .select("battery_volt,updated_at")
          .eq("device_id",dev.id)
          .order("updated_at",{ascending:false})
          .limit(1)
          .maybeSingle();
        list.push({
          deviceId:dev.id, deviceName:dev.device_name, location:dev.location ?? "",
          batteryVolt:log?.battery_volt ?? null, lastUpdated:log?.updated_at ?? null,
        });
      }
      setDeviceBatteryInfo(list);
    }finally{ setLoadingDevices(false); }
  };

  /* ---------- Calendar Day decorator ---------- */
  const CustomDayContent = (props:DayContentProps)=>{
    const key = `${props.date.getFullYear()}-${props.date.getMonth()+1}-${props.date.getDate()}`;
    return(
      <div className="relative flex items-center justify-center w-full h-full">
        {datesWithData.has(key)&&<div className="absolute w-10 h-10 bg-purple-300/50 rounded-full blur-sm" />}
        <span className="relative z-10">{props.date.getDate()}</span>
      </div>
    );
  };

  /* ---------- Battery icon ---------- */
  const BatteryIcon = ({level}:{level:BatteryLevel})=>{
    switch(level){
      case BatteryLevel.HIGH:    return <BatteryFull     className="h-5 w-5 text-green-500 mb-1"/>;
      case BatteryLevel.MIDDLE:  return <BatteryMedium   className="h-5 w-5 text-yellow-500 mb-1"/>;
      case BatteryLevel.LOW:     return <BatteryLow      className="h-5 w-5 text-orange-500 mb-1"/>;
      case BatteryLevel.WARNING: return <BatteryWarning  className="h-5 w-5 text-red-500 mb-1"/>;
      default:                   return <Battery         className="h-5 w-5 text-gray-400 mb-1"/>;
    }
  };

  /* ================= JSX ================= */
  // AuthGateWrapperで認証中の場合、そちらに任せる
  if(authLoading) {
    return null; // AuthGateWrapperがローディング表示を担当
  }
  
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
              onClick={() => router.push(`/temperature/weekly-verification?department=${encodeURIComponent(departmentName ?? '')}&departmentId=${departmentId ?? ''}&facilityId=${facilityId ?? ''}`)}
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
                onClick={() => router.push(`/temperature/monthly-verification?department=${encodeURIComponent(departmentName ?? '')}&departmentId=${departmentId ?? ''}&facilityId=${facilityId ?? ''}`)}
                className="bg-gradient-to-r from-orange-300 to-red-300 hover:from-orange-400 hover:to-red-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
              >
                <CalendarIcon className="h-5 w-5 mr-2 text-orange-100" />
                月次温度確認
              </Button>
            </motion.div>
          )}

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => router.push(`/temperature/sensor-data?department=${encodeURIComponent(departmentName ?? '')}&departmentId=${departmentId ?? ''}`)}
              className="bg-gradient-to-r from-purple-300 to-pink-400 hover:from-purple-400 hover:to-pink-500 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
            >
              <Activity className="h-5 w-5 mr-2 text-purple-100" />
              センサーデータ履歴
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => router.push(`/temperature/new?department=${encodeURIComponent(departmentName ?? '')}&departmentId=${departmentId ?? ''}`)}
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
            onSelect={(d) => d && setDate(d)}
            className="rounded-md border w-full max-w-none"
            components={{ DayContent: CustomDayContent }}
          />
        </div>

        {/* レコード表示 */}
        <div className="bg-white rounded-lg border border-border overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="h-12 w-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="mt-4 text-pink-700">データを読み込み中...</p>
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
{record.created_at ? formatDateForDisplay(record.created_at) : '-'}
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
                        href={`/temperature/record/${record.id}?department=${encodeURIComponent(departmentName ?? '')}&departmentId=${departmentId ?? ''}`}
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
                  <div className="h-10 w-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4 text-pink-700">デバイス情報を読み込み中...</p>
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
                              {device.lastUpdated ? 
                                formatJSTDateTime(device.lastUpdated) : 
                                '未取得'
                              }
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
