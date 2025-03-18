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

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [temperatureItems, setTemperatureItems] = useState<TemperatureItem[]>([]);
  const [records, setRecords] = useState<TemperatureRecord[]>([]);
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [facilityName, setFacilityName] = useState<string>("");
  const [facilityId, setFacilityId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // センサーデータの状態
  const [sensorData, setSensorData] = useState<SensorData>({
    ahtTemp: null,
    bmpTemp: null,
    ahtHum: null,
    bmpPres: null,
    lastUpdated: null
  });
  const [showSensorData, setShowSensorData] = useState<boolean>(false);

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
          
          setLoading(false);
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
      } catch (error) {
        console.error("Error fetching items:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchRecords = async () => {
      setLoading(true);
      
      try {
        // まずキャッシュから施設情報を取得
        const cachedFacility = getCachedFacility();
        
        if (cachedFacility && cachedFacility.id) {
          // キャッシュに施設情報がある場合はそれを使用
          const { data, error } = await supabase
            .from("temperature_records")
            .select(`
              id,
              record_date,
              temperature_record_details (
                id,
                temperature_item_id,
                value
              ),
              facility_id
            `)
            .eq("department_id", departmentId)
            .eq("facility_id", cachedFacility.id)
            .order("record_date", { ascending: false });
    
          if (error) {
            console.error("Temperature Records Error:", error);
          } else if (data) {
            setRecords(data);
            const dateSet = new Set(
              data.map(record =>
                new Date(record.record_date).toISOString().split("T")[0]
              )
            );
            setDatesWithData(dateSet);
          }
          
          setLoading(false);
          return; // キャッシュから取得できたので処理終了
        }
      
        // キャッシュに施設情報がない場合はデータベースから取得
        const userProfile = await getCurrentUser();
        if (!userProfile || !userProfile.id) {
          console.error("ユーザー情報の取得に失敗しました");
          setLoading(false);
          return;
        }
        
        // 施設IDの取得がまだであれば取得
        if (!facilityId) {
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
          
          const { data, error } = await supabase
            .from("temperature_records")
            .select(`
              id,
              record_date,
              temperature_record_details (
                id,
                temperature_item_id,
                value
              ),
              facility_id
            `)
            .eq("department_id", departmentId)
            .eq("facility_id", profileData.facility_id)
            .order("record_date", { ascending: false });
      
          if (error) {
            console.error("Temperature Records Error:", error);
          } else if (data) {
            setRecords(data);
            const dateSet = new Set(
              data.map(record =>
                new Date(record.record_date).toISOString().split("T")[0]
              )
            );
            setDatesWithData(dateSet);
          }
        } else {
          // 既に施設IDがある場合はそれを使用
          const { data, error } = await supabase
            .from("temperature_records")
            .select(`
              id,
              record_date,
              temperature_record_details (
                id,
                temperature_item_id,
                value
              ),
              facility_id
            `)
            .eq("department_id", departmentId)
            .eq("facility_id", facilityId)
            .order("record_date", { ascending: false });
      
          if (error) {
            console.error("Temperature Records Error:", error);
          } else if (data) {
            setRecords(data);
            const dateSet = new Set(
              data.map(record =>
                new Date(record.record_date).toISOString().split("T")[0]
              )
            );
            setDatesWithData(dateSet);
          }
        }
      } catch (error) {
        console.error("Error fetching records:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
    fetchRecords();
  }, [departmentId, facilityId]);

  // 最新のセンサーデータを取得する関数
  const fetchLatestSensorData = useCallback(async () => {
    if (!facilityId || !departmentId) return;
    
    try {
      // センサーデバイスを取得
      const { data: deviceData, error: deviceError } = await supabase
        .from('sensor_devices')
        .select('id')
        .eq('facility_id', facilityId)
        .eq('department_id', departmentId)
        .single();
        
      if (deviceError) {
        console.log('No sensor device found for this department');
        return;
      }
      
      // デバイスからの最新のセンサーログを取得
      const { data: logData, error: logError } = await supabase
        .from('sensor_logs')
        .select('raw_data, recorded_at')
        .eq('sensor_device_id', deviceData.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();
        
      if (logError) {
        console.log('No sensor logs found');
        return;
      }
      
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
    } catch (error) {
      console.error('Error fetching sensor data:', error);
    }
  }, [facilityId, departmentId]);
  
  // リアルタイムセンサーデータの取得
  useEffect(() => {
    if (!facilityId || !departmentId) return;

    // 最新のセンサーデータを取得
    fetchLatestSensorData();

    // 1分ごとに更新
    const interval = setInterval(fetchLatestSensorData, 60 * 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [facilityId, departmentId, fetchLatestSensorData]);

  const CustomDayContent = (props: DayContentProps) => {
    const dateStr = props.date.toISOString().split("T")[0];
    const hasData = datesWithData.has(dateStr);

    return (
      <div className="relative flex items-center justify-center">
        {hasData && (
          <div 
            className="absolute w-7 h-7 bg-purple-400/40 rounded-full"
            style={{ filter: "blur(8px)" }}
          />
        )}
        <span className="relative z-10">{props.date.getDate()}</span>
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
      <main className="mx-auto mb-6 space-y-6" style={{ width: "80%" }}>
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
                最終更新: {new Date(sensorData.lastUpdated).toLocaleString()}
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
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border"
            components={{ DayContent: CustomDayContent }}
            modifiers={{ today: new Date() }}
            modifiersStyles={{
              today: {
                color: "rgb(255,69,0)",
                fontWeight: "bold"
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
          {loading ? (
            <p className="p-4">Loading...</p>
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
                      className="px-4 py-3 text-left text-sm font-medium text-foreground"
                    >
                      {item.display_name || item.item_name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-900">
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {new Date(record.record_date).toLocaleDateString()}
                      {record.is_auto_recorded && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">自動</span>
                      )}
                    </td>
                    {temperatureItems.map((item) => {
                      const detail = record.temperature_record_details.find(
                        (d) => d.temperature_item_id === item.id
                      );
                      const rawVal = detail ? detail.value : item.default_value;
                      const isBoolItem = item.item_name === "seika_samplecheck";
                      const isSensorData = detail?.data_source === 'sensor';
                      
                      if (isBoolItem) {
                        return (
                          <td key={item.id} className="px-4 py-3 text-center">
                            {rawVal === 1 ? (
                              <Check className="h-5 w-5 mx-auto text-green-600" />
                            ) : (
                              <X className="h-5 w-5 mx-auto text-red-600" />
                            )}
                          </td>
                        );
                      } else {
                        return (
                          <td key={item.id} className="px-4 py-3 text-center">
                            <span className={isSensorData ? "text-blue-600 font-medium" : ""}>
                              {rawVal}℃
                            </span>
                            {isSensorData && (
                              <span className="ml-1 text-xs text-blue-500">●</span>
                            )}
                          </td>
                        );
                      }
                    })}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="px-3 py-1.5 text-gray-600 hover:bg-secondary rounded transition-colors">
                          Edit
                        </button>
                        <button className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors">
                          Delete
                        </button>
                      </div>
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
