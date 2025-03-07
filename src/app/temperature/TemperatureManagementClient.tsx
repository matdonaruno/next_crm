'use client';

import { Calendar } from "@/components/ui/calendar";
import { Bell, Plus, FileText, ChevronLeft, Home, Check, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DayContentProps } from "react-day-picker";

interface TemperatureRecordDetail {
  id: string;
  temperature_item_id: string;
  value: number;
}

interface TemperatureRecord {
  id: string;
  record_date: string;
  temperature_record_details: TemperatureRecordDetail[];
  facility_id: string;
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

  useEffect(() => {
    if (!departmentId) return;

    const fetchItems = async () => {
      setLoading(true);
      
      // ユーザーの施設IDを取得
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        console.error("ユーザー情報の取得に失敗しました");
        setLoading(false);
        return;
      }
      
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("facility_id")
        .eq("id", userData.user.id)
        .single();
        
      if (profileError || !profileData?.facility_id) {
        console.error("施設情報の取得に失敗しました");
        setLoading(false);
        return;
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
      setLoading(false);
    };

    const fetchRecords = async () => {
      setLoading(true);
      
      // ユーザーの施設IDを取得
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        console.error("ユーザー情報の取得に失敗しました");
        setLoading(false);
        return;
      }
      
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("facility_id")
        .eq("id", userData.user.id)
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
      setLoading(false);
    };

    fetchItems();
    fetchRecords();
  }, [departmentId]);

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
            Welcome to the temperature management system for {departmentName}. Here you can track and manage temperature records.
          </p>
        </div>

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
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              window.location.href = `/temperature/new?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`;
            }}
            className="button-style text-primary-foreground rounded-md px-4 py-2.5 font-medium transition-all duration-200 hover:bg-violet-300 focus:outline-none focus:ring-2 focus:ring-primary/20 flex items-center justify-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Add New Temperature Record
          </button>
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
                    </td>
                    {temperatureItems.map((item) => {
                      const detail = record.temperature_record_details.find(
                        (d) => d.temperature_item_id === item.id
                      );
                      const rawVal = detail ? detail.value : item.default_value;
                      const isBoolItem = item.item_name === "seika_samplecheck";
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
                            {rawVal}℃
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
    </div>
  );
}
