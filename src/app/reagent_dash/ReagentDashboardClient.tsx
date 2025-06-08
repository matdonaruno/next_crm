"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  AlertTriangle,
  FlaskRound,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import supabase from "@/lib/supabaseBrowser";
import { useAuth } from "@/contexts/AuthContext";
import Papa from 'papaparse';
import { AppHeader } from "@/components/ui/app-header";
import { motion } from "framer-motion";
import { getJstTimestamp } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner, CompactLoadingSpinner } from '@/components/common/LoadingSpinner';

interface Reagent {
  id: number;
  department: string; // department UUID
  name: string;
  lotNo: string;
  specification: string;
  unit: string;
  expirationDate: string;
  registrationDate: string;
  registeredBy: { fullname: string } | string;
  used: boolean;
  used_at: string | null;
  ended_at: string | null;
  used_by?: { fullname: string } | string | null;
  ended_by?: { fullname: string } | string | null;
  items?: ReagentItem[];
}

interface ReagentItem {
  id: number;
  name: string;
  usagestartdate: string;
  user: string;
  user_fullname?: string;
  created_at: string;
  reagent_package_id: number;
  ended_at?: string;
  ended_by?: string;
  ended_by_fullname?: string;
}

interface ReagentMaster {
  code: string;
  name: string;
  manufacturer?: string;
  category?: string;
}

const formatDateTime = (timestamp: string | null) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ReagentDashboardClient() {
  const { profile, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [reagentItems, setReagentItems] = useState<ReagentItem[]>([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [showEnded, setShowEnded] = useState(false);
  const [expandedReagents, setExpandedReagents] = useState<Record<number, boolean>>({});
  const [compactMode, setCompactMode] = useState<boolean>(true);
  const [allExpanded, setAllExpanded] = useState<boolean>(false);
  const [expiryNotifications, setExpiryNotifications] = useState<Reagent[]>([]);
  const [reagentMasterData, setReagentMasterData] = useState<Record<string, ReagentMaster>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [autoReloadTimerId, setAutoReloadTimerId] = useState<NodeJS.Timeout | null>(null);
  const [departments, setDepartments] = useState<Array<{id: string, name: string}>>([]);

  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'warning',
      message: '3件の試薬が期限切れ間近です(デモ用)',
      timestamp: new Date(),
    },
    {
      id: 2,
      type: 'info',
      message: '試薬在庫状況が更新されました(デモ用)',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    {
      id: 3,
      type: 'success',
      message: '新しい試薬管理ガイドラインが公開されました(デモ用)',
      timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000),
    }
  ]);

  // 背景色を白色に変更
  useEffect(() => {
    return () => {
      console.log("ReagentDashboard: コンポーネントがアンマウントされました");
    };
  }, []);

  // ユーザーIDからフルネームを取得する関数
  const [userCache, setUserCache] = useState<Record<string, string>>({});
  
  const getUserFullname = useCallback(async (userId: string): Promise<string> => {
    try {
      if (!userId) return "";
      
      // キャッシュから取得
      if (userCache[userId]) {
        return userCache[userId];
      }
      
      console.log("ReagentDash: ユーザー名取得", { userId });
      
      const { data, error } = await supabase
        .from("profiles")
        .select("fullname")
        .eq("id", userId)
        .single();
        
      if (error) {
        console.error("ReagentDash: ユーザー名取得エラー:", error);
        return `ユーザー(${userId.substring(0, 8)})`;
      }
      
      const fullname = data?.fullname || `ユーザー(${userId.substring(0, 8)})`;
      
      // キャッシュに保存
      setUserCache(prev => ({ ...prev, [userId]: fullname }));
      
      return fullname;
    } catch (err) {
      console.error("ReagentDash: ユーザー名取得エラー:", err);
      return `ユーザー(${userId.substring(0, 8)})`;
    }
  }, [userCache]);

  // 試薬名をマスターデータから取得する関数
  const getReagentNameByCode = useCallback((code: string): string => {
    if (!code) return '';
    
    const masterData = reagentMasterData[code];
    if (masterData) {
      return masterData.name;
    }
    
    return code;
  }, [reagentMasterData]);

  // 期限切れ通知チェック
  const checkExpiryNotifications = useCallback((reagentData: Reagent[]) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const expiringReagents = reagentData.filter(reagent => {
      const expiryDate = new Date(reagent.expirationDate);
      return expiryDate <= thirtyDaysFromNow && expiryDate >= now && !reagent.ended_at;
    });
    
    console.log("ReagentDash: 期限切れ間近の試薬", { count: expiringReagents.length });
    setExpiryNotifications(expiringReagents);
  }, []);

  // 部署マスターデータを取得
  const fetchDepartments = useCallback(async () => {
    if (!profile?.facility_id) return;
    
    try {
      console.log("ReagentDash: 部署マスター取得開始");
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("facility_id", profile.facility_id)
        .order("name");
        
      if (error) {
        console.error("ReagentDash: 部署マスター取得エラー:", error);
        return;
      }
      
      console.log("ReagentDash: 部署マスター取得成功", { count: data?.length || 0 });
      setDepartments(data || []);
    } catch (error) {
      console.error("ReagentDash: 部署マスター取得エラー:", error);
    }
  }, [profile?.facility_id]);

  // 試薬マスターデータをCSVから読み込む
  const loadReagentMasterData = async () => {
    try {
      console.log("ReagentDash: 試薬マスターデータの読み込みを開始");
      const response = await fetch('/products.csv');
      
      if (!response.ok) {
        console.error('ReagentDash: CSVファイル取得エラー:', response.status, response.statusText);
        return;
      }
      
      const csvText = await response.text();
      console.log("ReagentDash: CSVデータ取得成功", { 
        dataLength: csvText.length,
        firstLine: csvText.split('\n')[0]
      });
      
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          console.log("ReagentDash: CSV解析完了", { 
            rowCount: results.data.length,
            sampleRow: results.data[0]
          });
          
          const masterData: Record<string, ReagentMaster> = {};
          results.data.forEach((row: unknown) => {
            const typedRow = row as Record<string, string>;
            if (typedRow.code) {
              masterData[typedRow.code] = {
                code: typedRow.code,
                name: typedRow.name,
                manufacturer: typedRow.manufacturer,
                category: typedRow.category
              };
            }
          });
          setReagentMasterData(masterData);
          console.log("ReagentDash: マスターデータ設定完了", { 
            entryCount: Object.keys(masterData).length 
          });
        },
        error: (error: Error) => {
          console.error('ReagentDash: CSV解析エラー:', error);
        }
      });
    } catch (error: unknown) {
      console.error('ReagentDash: 試薬マスターデータの読み込みエラー:', error);
    }
  };

  // 試薬アイテムの取得
  const fetchReagentItems = useCallback(async () => {
    if (!profile?.facility_id) {
      console.log("ReagentDash: fetchReagentItems - 施設IDがありません");
      return;
    }

    try {
      console.log("ReagentDash: 試薬アイテムの取得開始", { facilityId: profile.facility_id });
      
      const { data, error } = await supabase
        .from("reagent_items")
        .select("*")
        .eq("facility_id", profile.facility_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("ReagentDash: 試薬アイテム取得エラー:", error);
        throw error;
      }

      const itemsWithFullnames = await Promise.all((data || []).map(async (item) => ({
        ...item,
        user_fullname: item.user ? await getUserFullname(item.user) : '',
        ended_by_fullname: item.ended_by ? await getUserFullname(item.ended_by) : ''
      })));

      console.log("ReagentDash: 試薬アイテム取得成功", { count: itemsWithFullnames.length });
      setReagentItems(itemsWithFullnames);
    } catch (error) {
      console.error("ReagentDash: 試薬アイテム取得エラー:", error);
    }
  }, [profile?.facility_id, getUserFullname]);

  // 試薬データの取得
  const fetchReagents = useCallback(async () => {
    if (!profile?.facility_id) {
      console.log("ReagentDash: fetchReagents - 施設IDがありません");
      return;
    }

    try {
      console.log("ReagentDash: 試薬データの取得開始", { facilityId: profile.facility_id });
      
      let query = supabase
        .from("reagents")
        .select("*")
        .eq("facility_id", profile.facility_id);
        
      // 部署IDが指定されている場合は部署IDでフィルタリング
      if (departmentId) {
        console.log(`ReagentDash: 部署ID "${departmentId}" でフィルタリング`);
        query = query.eq("department", departmentId);
      }
      
      const { data, error } = await query.order("registrationDate", { ascending: false });

      if (error) {
        console.error("ReagentDash: 試薬データ取得エラー:", error);
        throw error;
      }

      console.log("ReagentDash: 試薬データ取得成功", { count: data?.length || 0 });
      
      // データ整形
      const formattedData = await Promise.all((data || []).map(async (item) => ({
        ...item,
        name: getReagentNameByCode(item.name),
        registeredBy: item.registeredBy ? await getUserFullname(item.registeredBy) : '',
        used_by: item.used_by ? await getUserFullname(item.used_by) : null,
        ended_by: item.ended_by ? await getUserFullname(item.ended_by) : null
      })));

      setReagents(formattedData);
      
      // 試薬アイテムも取得
      await fetchReagentItems();
      
      // 期限切れ通知をチェック
      checkExpiryNotifications(formattedData);
    } catch (error) {
      console.error("ReagentDash: 試薬データ取得エラー:", error);
      throw error;
    }
  }, [profile?.facility_id, getReagentNameByCode, getUserFullname, checkExpiryNotifications]);

  // 現在のユーザープロファイルの取得
  const fetchCurrentUserProfile = useCallback(async () => {
    if (!user?.id || !profile?.facility_id) {
      console.log("ReagentDash: fetchCurrentUserProfile - ユーザーIDまたは施設IDがありません");
      return;
    }

    try {
      console.log("ReagentDash: ユーザープロファイル取得開始", { userId: user.id });
      
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("fullname")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("ReagentDash: ユーザープロファイル取得エラー:", userError);
      } else if (userData) {
        console.log("ReagentDash: ユーザープロファイル取得成功", { fullname: userData.fullname });
        setCurrentUserName(userData.fullname || "");
      }

      // 施設名も取得
      const { data: facilityData, error: facilityError } = await supabase
        .from("facilities")
        .select("name")
        .eq("id", profile.facility_id)
        .single();

      if (facilityError) {
        console.error("ReagentDash: 施設情報取得エラー:", facilityError);
      } else if (facilityData) {
        console.log("ReagentDash: 施設情報取得成功", { name: facilityData.name });
        setFacilityName(facilityData.name || "");
      }
    } catch (error) {
      console.error("ReagentDash: プロファイル取得エラー:", error);
    }
  }, [user?.id, profile?.facility_id]);

  // 試薬パッケージの展開・折りたたみ
  const toggleReagentExpand = useCallback((reagentId: number) => {
    setExpandedReagents(prev => ({
      ...prev,
      [reagentId]: !prev[reagentId]
    }));
  }, []);

  // 使用開始処理
  const handleUsageStart = useCallback(async (reagentId: number) => {
    if (!user?.id || !profile?.facility_id) return;

    try {
      console.log("ReagentDash: 使用開始処理", { reagentId });
      
      const now = getJstTimestamp();
      
      // reagentsテーブルを更新
      const { error: updateError } = await supabase
        .from("reagents")
        .update({
          used: true,
          used_at: now,
          used_by: user.id
        })
        .eq("id", reagentId)
        .eq("facility_id", profile.facility_id);

      if (updateError) {
        console.error("ReagentDash: 使用開始更新エラー:", updateError);
        throw updateError;
      }

      console.log("ReagentDash: 使用開始処理成功");
      
      // データを再取得
      await fetchReagents();
    } catch (error) {
      console.error("ReagentDash: 使用開始処理エラー:", error);
      alert("使用開始の処理中にエラーが発生しました。");
    }
  }, [user?.id, profile?.facility_id, fetchReagents]);

  // 使用終了処理
  const handleUsageEnd = useCallback(async (reagentId: number) => {
    if (!user?.id || !profile?.facility_id) return;

    try {
      console.log("ReagentDash: 使用終了処理", { reagentId });
      
      const now = getJstTimestamp();
      
      // reagentsテーブルを更新
      const { error: updateError } = await supabase
        .from("reagents")
        .update({
          ended_at: now,
          ended_by: user.id
        })
        .eq("id", reagentId)
        .eq("facility_id", profile.facility_id);

      if (updateError) {
        console.error("ReagentDash: 使用終了更新エラー:", updateError);
        throw updateError;
      }

      // 関連するreagent_itemsも終了させる
      const { error: itemsError } = await supabase
        .from("reagent_items")
        .update({
          ended_at: now,
          ended_by: user.id
        })
        .eq("reagent_package_id", reagentId)
        .eq("facility_id", profile.facility_id)
        .is("ended_at", null);

      if (itemsError) {
        console.error("ReagentDash: アイテム終了更新エラー:", itemsError);
      }

      console.log("ReagentDash: 使用終了処理成功");
      
      // データを再取得
      await fetchReagents();
    } catch (error) {
      console.error("ReagentDash: 使用終了処理エラー:", error);
      alert("使用終了の処理中にエラーが発生しました。");
    }
  }, [user?.id, profile?.facility_id, fetchReagents]);

  // 試薬アイテムの使用終了処理
  const handleItemUsageEnd = useCallback(async (itemId: number) => {
    if (!user?.id || !profile?.facility_id) return;

    try {
      console.log("ReagentDash: アイテム使用終了処理", { itemId });
      
      const now = getJstTimestamp();
      
      // reagent_itemsテーブルを更新
      const { error: updateError } = await supabase
        .from("reagent_items")
        .update({
          ended_at: now,
          ended_by: user.id
        })
        .eq("id", itemId)
        .eq("facility_id", profile.facility_id);

      if (updateError) {
        console.error("ReagentDash: アイテム使用終了更新エラー:", updateError);
        throw updateError;
      }

      console.log("ReagentDash: アイテム使用終了処理成功");
      
      // データを再取得
      await fetchReagentItems();
    } catch (error) {
      console.error("ReagentDash: アイテム使用終了処理エラー:", error);
      alert("使用終了の処理中にエラーが発生しました。");
    }
  }, [user?.id, profile?.facility_id, fetchReagentItems]);

  // メインのuseEffect
  useEffect(() => {
    console.log("ReagentDash: メインuseEffect実行", { 
      hasProfile: !!profile,
      facilityId: profile?.facility_id || 'なし',
      isLoading: loading
    });
    
    if (loading) {
      console.log("ReagentDash: 認証情報ロード中のため、データ取得を延期");
      return;
    }
    
    if (!profile?.facility_id) {
      console.log("ReagentDash: 施設IDがないため、データ取得をスキップ");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setLoadingStartTime(Date.now());
    
    console.log("ReagentDash: マスターデータとデータの取得を開始");
    
    const fetchData = async () => {
      try {
        await loadReagentMasterData();
        await fetchDepartments();
        await fetchCurrentUserProfile();
        await fetchReagents();
        
        setIsLoading(false);
        setLoadingStartTime(null);
        if (autoReloadTimerId) {
          clearTimeout(autoReloadTimerId);
          setAutoReloadTimerId(null);
        }
      } catch (err) {
        console.error("ReagentDash: データ取得中にエラーが発生:", err);
        setError("データの取得中にエラーが発生しました。");
        setIsLoading(false);
        setLoadingStartTime(null);
        if (autoReloadTimerId) {
          clearTimeout(autoReloadTimerId);
          setAutoReloadTimerId(null);
        }
      }
    };
    
    fetchData();
  }, [loading, profile?.facility_id, fetchDepartments]);

  // 自動リロード用のuseEffect
  useEffect(() => {
    if (loadingStartTime && isLoading) {
      const timerId = setTimeout(() => {
        console.log("ReagentDash: データ読み込みが長時間かかっているため、ページを自動リロードします");
        window.location.reload();
      }, 15000);

      setAutoReloadTimerId(timerId);

      return () => {
        if (timerId) {
          clearTimeout(timerId);
        }
      };
    }
  }, [loadingStartTime, isLoading]);

  // 部署一覧の取得（部署マスターから取得）
  const departmentOptions = useMemo(() => {
    return departments;
  }, [departments]);

  // 試薬パッケージごとにアイテムをグループ化
  const reagentsWithItems = useMemo(() => {
    return reagents.map(reagent => {
      const items = reagentItems.filter(item => item.reagent_package_id === reagent.id);
      return {
        ...reagent,
        items
      };
    });
  }, [reagents, reagentItems]);

  // フィルタリング後の試薬一覧
  const filteredReagents = useMemo(() => {
    return reagentsWithItems.filter((r) => {
      const matchesDept =
        selectedDepartment === "all" || r.department === selectedDepartment;
      const matchesEnded = showEnded ? true : !r.ended_at;
      return matchesDept && matchesEnded;
    });
  }, [reagentsWithItems, selectedDepartment, showEnded]);

  if (loading) {
    return <LoadingSpinner message="データを読み込み中..." fullScreen />;
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader 
        title="Clinical Reagent Manager" 
        showBackButton={true}
        icon={<FlaskRound className="h-6 w-6 text-pink-500" />}
      />
      
      <main className="container max-w-7xl mx-auto px-4 py-6">
        {/* ユーザー情報表示 */}
        <div className="w-full mb-4">
          <div className="text-right">
            {facilityName && (
              <p className="text-sm text-gray-600">
                施設「{facilityName}」
              </p>
            )}
            {currentUserName && (
              <p className="text-sm text-gray-600">
                {currentUserName}さんがログインしています
              </p>
            )}
          </div>
        </div>

        {/* 通知エリア */}
        {notifications.length > 0 && (
          <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md mb-6">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
              <Bell className="inline-block mr-2 h-5 w-5 text-pink-500" />
              通知 ({notifications.length}件)
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <ul className="list-disc pl-5 text-left">
                {notifications.map((notification) => (
                  <li key={`notification-${notification.id}`} className="text-sm text-foreground mb-1">
                    {notification.message}
                    <span className="text-xs text-muted-foreground ml-2">
                      {notification.timestamp.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 text-right">
              <Button variant="link" className="text-pink-500 text-sm p-0 h-auto">
                すべての通知を表示
              </Button>
            </div>
          </div>
        )}

        {/* ヘッダー部分 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Reagent Dash</h1>
            <p className="text-muted-foreground">
              {departmentName || '全部署'}の試薬在庫・使用状況
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button 
                onClick={() => router.push(`/reagent/register-new?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`)}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow hover:bg-primary/90 h-9 px-4 w-full bg-gradient-to-r from-pink-300 to-purple-400 hover:from-pink-300 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
              >
                <Plus className="mr-2 h-5 w-5" />
                新規試薬登録
              </Button>
            </motion.div>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-md mb-6">
            <p className="text-red-700 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              {error}
            </p>
          </div>
        )}

        {/* ローディング中の表示 */}
        {isLoading && (
          <div className="bg-white shadow-sm border rounded-md my-6">
            <CompactLoadingSpinner message="データを読み込み中..." />
          </div>
        )}

        {/* 期限切れ通知エリア */}
        {expiryNotifications.length > 0 && (
          <div className="mb-6 p-4 border border-yellow-300 bg-yellow-50 rounded-md">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              <AlertTriangle className="inline-block mr-2 h-5 w-5" />
              期限切れ間近の試薬 ({expiryNotifications.length}件)
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <ul className="list-disc pl-5">
                {expiryNotifications.map((reagent) => (
                  <li key={`expiry-${reagent.id}`} className="text-sm text-yellow-700 mb-1">
                    <span className="font-medium">{reagent.name}</span> (Lot: {reagent.lotNo}) - 
                    有効期限: {formatDateTime(reagent.expirationDate)}
                    <Button
                      variant="link"
                      size="sm"
                      className="text-blue-600 p-0 h-auto ml-2"
                      onClick={() => router.push(`/reagent/${reagent.id}`)}
                    >
                      詳細を見る
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* フィルターコントロール */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Input
                  placeholder="試薬名・Lot No.で検索"
                  className="pl-3 w-full"
                  onChange={(e) => {
                    // 検索フィルター機能を実装する場合はここに追加
                  }}
                />
              </div>
            </div>
            
            <div className="w-full md:w-auto">
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="部署を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての部署</SelectItem>
                  {departmentOptions.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center">
              <Button 
                variant={showEnded ? "secondary" : "outline"} 
                className={`text-sm w-full justify-start md:w-auto ${showEnded ? "bg-blue-100 text-blue-800 border-blue-300" : ""}`}
                onClick={() => setShowEnded(!showEnded)}
              >
                <span className="mr-2">使用終了済みを表示</span>
              </Button>
            </div>
          </div>
        </div>

        {/* 表示コントロール */}
        <div className="mb-6 flex justify-between">
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompactMode(!compactMode)}
              className="flex items-center"
            >
              {compactMode ? (
                <>
                  <span>標準表示</span>
                </>
              ) : (
                <>
                  <span>コンパクト表示</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (allExpanded) {
                  setExpandedReagents({});
                  setAllExpanded(false);
                } else {
                  const expandedState: Record<number, boolean> = {};
                  reagents.forEach(reagent => {
                    const items = reagentItems.filter(item => item.reagent_package_id === reagent.id);
                    if (items.length > 0) {
                      expandedState[reagent.id] = true;
                    }
                  });
                  setExpandedReagents(expandedState);
                  setAllExpanded(true);
                }
              }}
              className="flex items-center"
            >
              {allExpanded ? (
                <>
                  <span>すべて折りたたむ</span>
                </>
              ) : (
                <>
                  <span>すべて展開</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* カードスタイルの調整 */}
        <Card className="shadow-sm border rounded-lg overflow-hidden">
          <CardHeader className="bg-gray-50 py-3 px-4 border-b">
            <CardTitle className="text-base font-medium">試薬一覧</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table className={`w-max min-w-full ${compactMode ? 'text-xs' : ''}`}>
              <TableHeader>
                <TableRow className="whitespace-nowrap">
                  <TableHead className={compactMode ? "w-8" : "w-10"}>
                    {/* 展開ボタン用 */}
                  </TableHead>
                  <TableHead className={compactMode ? "min-w-[150px] max-w-[300px]" : "min-w-[200px] max-w-[400px]"}>試薬名</TableHead>
                  <TableHead className={compactMode ? "min-w-[80px]" : "min-w-[100px]"}>Lot No.</TableHead>
                  <TableHead className={compactMode ? "min-w-[80px]" : "min-w-[100px]"}>規格</TableHead>
                  <TableHead className={compactMode ? "min-w-[60px]" : "min-w-[80px]"}>単位</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"}>有効期限</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"} style={{ backgroundColor: 'rgba(var(--primary), 0.1)' }}>使用開始日</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"} style={{ backgroundColor: 'rgba(var(--primary), 0.1)' }}>使用終了日</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"}>使用入力者</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"}>終了入力者</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"}>登録日</TableHead>
                  <TableHead className={compactMode ? "min-w-[100px]" : "min-w-[120px]"}>登録者</TableHead>
                  <TableHead className={compactMode ? "min-w-[150px]" : "min-w-[200px]"}>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReagents.map((reagent) => {
                  const isExpired = new Date(reagent.expirationDate) < new Date();
                  const isExpiringSoon = expiryNotifications.some(n => n.id === reagent.id);
                  const hasItems = reagent.items && reagent.items.length > 0;
                  const isExpanded = expandedReagents[reagent.id] || false;

                  return (
                    <React.Fragment key={reagent.id}>
                      <TableRow
                        className={`
                          ${isExpired ? "bg-red-50" : ""}
                          ${isExpiringSoon && !isExpired ? "bg-yellow-50" : ""}
                          ${reagent.ended_at ? "opacity-50" : ""}
                          hover:bg-muted/50 transition-colors
                        `}
                      >
                        <TableCell className="text-center">
                          {hasItems && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleReagentExpand(reagent.id)}
                              className="h-6 w-6 p-0"
                            >
                              {isExpanded ? (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className={`font-medium ${compactMode ? "text-xs" : ""}`}>
                          <div className="flex items-center gap-2">
                            <span className="truncate" title={reagent.name}>
                              {reagent.name}
                            </span>
                            {hasItems && (
                              <span className="text-xs text-muted-foreground">
                                ({reagent.items.length})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>{reagent.lotNo}</TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>{reagent.specification}</TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>{reagent.unit}</TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>
                          <span className={isExpired ? "text-red-600 font-semibold" : ""}>
                            {formatDateTime(reagent.expirationDate)}
                          </span>
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""} style={{ backgroundColor: reagent.used_at ? 'rgba(var(--primary), 0.05)' : '' }}>
                          {reagent.used_at ? formatDateTime(reagent.used_at) : "-"}
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""} style={{ backgroundColor: reagent.ended_at ? 'rgba(var(--primary), 0.05)' : '' }}>
                          {reagent.ended_at ? formatDateTime(reagent.ended_at) : "-"}
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>
                          {reagent.used_by || "-"}
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>
                          {reagent.ended_by || "-"}
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>
                          {formatDateTime(reagent.registrationDate)}
                        </TableCell>
                        <TableCell className={compactMode ? "text-xs" : ""}>
                          {reagent.registeredBy}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {!reagent.used && !reagent.ended_at && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUsageStart(reagent.id)}
                                className="w-full bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                              >
                                使用開始
                              </Button>
                            )}
                            {reagent.used && !reagent.ended_at && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => router.push(`/reagent/use?reagentId=${reagent.id}`)}
                                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                                >
                                  アイテム追加
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUsageEnd(reagent.id)}
                                  className="w-full bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                                >
                                  使用終了
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/reagent/${reagent.id}`)}
                              className="w-full"
                            >
                              詳細
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* 展開されたアイテムの表示 */}
                      {isExpanded && reagent.items && reagent.items.map((item, index) => (
                        <TableRow key={`item-${item.id}`} className="bg-gray-50">
                          <TableCell></TableCell>
                          <TableCell colSpan={5} className={`pl-12 ${compactMode ? "text-xs" : ""}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">└</span>
                              <span>アイテム {index + 1}</span>
                            </div>
                          </TableCell>
                          <TableCell className={compactMode ? "text-xs" : ""}>
                            {formatDateTime(item.usagestartdate)}
                          </TableCell>
                          <TableCell className={compactMode ? "text-xs" : ""}>
                            {item.ended_at ? formatDateTime(item.ended_at) : "-"}
                          </TableCell>
                          <TableCell className={compactMode ? "text-xs" : ""}>
                            {item.user_fullname || item.user}
                          </TableCell>
                          <TableCell className={compactMode ? "text-xs" : ""}>
                            {item.ended_by_fullname || item.ended_by || "-"}
                          </TableCell>
                          <TableCell colSpan={2}></TableCell>
                          <TableCell>
                            {!item.ended_at && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleItemUsageEnd(item.id)}
                                className="w-full bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                              >
                                終了
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {/* テーブルフッター */}
          {filteredReagents.length > 0 && (
            <div className="bg-gray-50 border-t p-3 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                全 {filteredReagents.length} 件の試薬データ
              </span>
              <div className="text-sm">
                <span>最終更新: {new Date().toLocaleString()}</span>
              </div>
            </div>
          )}
          
          {/* データがない場合の表示 */}
          {filteredReagents.length === 0 && !isLoading && (
            <div className="p-8 text-center">
              <p className="text-gray-500 mb-4">表示するデータがありません</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setSelectedDepartment("all");
                  setShowEnded(false);
                }}
              >
                フィルターをリセット
              </Button>
            </div>
          )}
        </Card>
      </main>

      <footer className="bg-background border-t">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          © 2025 Your side partner. All rights reserved.
        </div>
      </footer>
    </div>
  );
}