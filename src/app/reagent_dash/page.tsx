"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import Papa from 'papaparse'; // CSVパーサーライブラリを追加
import { AppHeader } from "@/components/ui/app-header";

interface Reagent {
  id: number;
  department: string;
  name: string;
  lotNo: string;
  specification: string;
  unit: string; // 追加：単位
  expirationDate: string; // ISO 日付文字列
  registrationDate: string;
  registeredBy: { fullname: string } | string;
  used: boolean;
  used_at: string | null;
  ended_at: string | null;
  used_by?: { fullname: string } | string | null;
  ended_by?: { fullname: string } | string | null;
  items?: ReagentItem[]; // 試薬アイテムの配列を追加
}

// 試薬アイテムのインターフェース
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

// 試薬マスターデータの型定義
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

export default function DashboardPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [reagentItems, setReagentItems] = useState<ReagentItem[]>([]); // 試薬アイテムの状態を追加
  const [currentUserName, setCurrentUserName] = useState("");
  // フィルター用の状態
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [showEnded, setShowEnded] = useState(false);
  const [expandedReagents, setExpandedReagents] = useState<Record<number, boolean>>({}); // 展開状態を管理
  // 表示モード用の状態を追加
  const [compactMode, setCompactMode] = useState<boolean>(false);
  // すべて展開状態を管理
  const [allExpanded, setAllExpanded] = useState<boolean>(false);
  // 期限切れ通知用の状態
  const [expiryNotifications, setExpiryNotifications] = useState<Reagent[]>([]);
  // 試薬マスターデータ
  const [reagentMasterData, setReagentMasterData] = useState<Record<string, ReagentMaster>>({});
  // ローディング状態を追加
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 背景色を白色に変更
  useEffect(() => {
    const body = document.querySelector('body');
    if (!body) return;

    // 元のbodyスタイルを保存
    const originalBackgroundColor = body.style.backgroundColor;
    const originalBackgroundImage = body.style.backgroundImage;
    const originalColor = body.style.color;
    
    // このページ用にbodyスタイルを変更
    body.style.backgroundColor = '#ffffff'; // 白色に変更
    body.style.backgroundImage = 'none';
    body.style.color = '#333333';

    return () => {
      // クリーンアップ時に元のスタイルに戻す
      body.style.backgroundColor = originalBackgroundColor;
      body.style.backgroundImage = originalBackgroundImage;
      body.style.color = originalColor;
    };
  }, []);

  // 試薬マスターデータをCSVから読み込む
  const loadReagentMasterData = async () => {
    try {
      // CSVが既に読み込まれている場合は再読み込みしない
      if (Object.keys(reagentMasterData).length > 0) {
        return;
      }
      
      const response = await fetch('/products.csv');
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
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
        },
        error: (error: Error) => {
          console.error('CSV解析エラー:', error);
        }
      });
    } catch (error: unknown) {
      console.error('試薬マスターデータの読み込みエラー:', error);
    }
  };

  // 試薬コードから試薬名を取得する関数
  const getReagentNameByCode = useCallback((code: string): string => {
    if (!code) return '';
    
    const masterData = reagentMasterData[code];
    if (masterData) {
      return masterData.name;
    }
    
    return code; // マスターデータに存在しない場合はコードをそのまま返す
  }, [reagentMasterData]);

  // 試薬アイテムの取得
  const fetchReagentItems = useCallback(async () => {
    if (!profile?.facility_id) return;

    const { data, error } = await supabase
      .from("reagent_items")
      .select("*")
      .eq("facility_id", profile.facility_id)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching reagent items:", error);
    } else {
      // ユーザー情報を取得して試薬アイテムに追加
      const itemsWithUserInfo = await Promise.all((data || []).map(async (item) => {
        const updatedItem = { ...item };
        
        // 利用者のユーザー情報を取得
        if (item.user) {
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("fullname")
            .eq("id", item.user)
            .single();
            
          if (!profileError && profileData) {
            updatedItem.user_fullname = profileData.fullname;
          }
        }
        
        // 終了者のユーザー情報を取得
        if (item.ended_by) {
          const { data: endedByData, error: endedByError } = await supabase
            .from("profiles")
            .select("fullname")
            .eq("id", item.ended_by)
            .single();
            
          if (!endedByError && endedByData) {
            updatedItem.ended_by_fullname = endedByData.fullname;
          }
        }
        
        return updatedItem;
      }));
      
      setReagentItems(itemsWithUserInfo);
    }
  }, [profile?.facility_id]);

  // 試薬データの取得（profiles との join で各ユーザー情報を取得）
  const fetchReagents = useCallback(async () => {
    if (!profile?.facility_id) {
      console.log("施設IDがないため、試薬データを取得できません");
      return;
    }

    console.log("試薬データ取得を開始します。施設ID:", profile.facility_id);
    
    try {
      const { data, error } = await supabase
        .from("reagents")
        .select(`*, registeredBy (fullname), used_by (fullname), ended_by (fullname)`)
        .eq("facility_id", profile.facility_id)
        .order("registrationDate", { ascending: false });

      if (error) {
        console.error("試薬データの取得エラー:", error);
      } else {
        console.log("取得した試薬データ:", data);
        console.log("試薬の総数:", data?.length || 0);
        
        // 試薬名をマスターデータから取得して設定
        const reagentsWithNames = (data || []).map(reagent => {
          // nameフィールドがコードの場合、マスターデータから名前を取得
          if (reagent.name && reagent.name.match(/^[A-Z0-9-]+$/)) {
            return {
              ...reagent,
              originalCode: reagent.name, // 元のコードを保存
              name: getReagentNameByCode(reagent.name) || reagent.name
            };
          }
          return reagent;
        });
        
        setReagents(reagentsWithNames);
        
        // 期限切れ通知を更新
        checkExpiryNotifications(reagentsWithNames);
      }
    } catch (fetchError) {
      console.error("試薬データ取得中に例外が発生しました:", fetchError);
    }
  }, [profile?.facility_id, getReagentNameByCode]);

  // カレントユーザーの氏名取得
  const fetchCurrentUserProfile = async () => {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      console.error("Error fetching current user:", error);
      return;
    }
    const userId = userData.user.id;
    
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("fullname")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("Error fetching profile:", profileError);
    } else if (profileData) {
      setCurrentUserName(profileData.fullname);
    }
  };

  // データ取得を一括で行う関数 - 依存配列を空にして無限ループを防止
  const fetchAllData = useCallback(async () => {
    console.log("データ取得を開始します");
    setIsLoading(true); // ローディング状態を設定
    
    try {
      // 直接関数を呼び出す（依存配列に含めない）
      await loadReagentMasterData();
      await fetchReagents();
      await fetchReagentItems();
      await fetchCurrentUserProfile();
      
      console.log("データ取得が完了しました");
    } catch (error) {
      console.error("データ取得中にエラーが発生しました:", error);
    } finally {
      setIsLoading(false); // ローディング状態を解除
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 初回マウント時にのみデータを取得
  useEffect(() => {
    let isMounted = true;
    let isDataFetched = false;
    
    const loadInitialData = async () => {
      if (isMounted && !isDataFetched) {
        isDataFetched = true;
        await fetchAllData();
      }
    };
    
    loadInitialData();
    
    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // タブがアクティブになったときのみデータを再取得
  useEffect(() => {
    let lastVisibilityChange = Date.now();
    
    const handleVisibilityChange = () => {
      const now = Date.now();
      // 最後の更新から5秒以上経過している場合のみ更新
      if (document.visibilityState === 'visible' && now - lastVisibilityChange > 5000) {
        lastVisibilityChange = now;
        fetchAllData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 期限切れ間近（1ヶ月以内）の試薬を検出する関数
  const checkExpiryNotifications = (reagents: Reagent[]) => {
    const today = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(today.getMonth() + 1);
    
    const nearExpiryReagents = reagents.filter(reagent => {
      if (!reagent.expirationDate) return false;
      
      // 使用終了した試薬は除外
      if (reagent.ended_at) return false;
      
      const expiryDate = new Date(reagent.expirationDate);
      // 有効期限が今日から1ヶ月以内で、かつ今日以降のもの
      return expiryDate <= oneMonthLater && expiryDate >= today;
    });
    
    setExpiryNotifications(nearExpiryReagents);
  };

  // 試薬パッケージの展開・折りたたみを切り替える
  const toggleReagentExpand = (reagentId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // 行のクリックイベントを停止
    setExpandedReagents(prev => ({
      ...prev,
      [reagentId]: !prev[reagentId]
    }));
  };

  // 行クリック時の処理（詳細画面への遷移）
  const handleRowClick = (reagent: Reagent) => {
    router.push(`/reagent/${reagent.id}`);
  };

  // ユニークな部署一覧（フィルター用）
  const departmentOptions = useMemo(() => {
    const deps = new Set<string>();
    reagents.forEach((r) => {
      if (r.department) deps.add(r.department);
    });
    return Array.from(deps);
  }, [reagents]);

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

  // 試薬アイテムの使用終了処理
  const handleItemUsageEnd = async (itemId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // イベントの伝播を停止
    
    if (!confirm("この試薬アイテムの使用を終了しますか？")) {
      return;
    }
    
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("Error getting user:", userError);
        return;
      }
      
      const userId = userData.user.id;
      
      const { error } = await supabase
        .from("reagent_items")
        .update({
          ended_at: new Date().toISOString(),
          ended_by: userId,
        })
        .eq("id", itemId)
        .eq("facility_id", profile?.facility_id); // 施設IDによる制限を追加
        
      if (error) {
        console.error("Error ending item usage:", error);
      } else {
        // 試薬アイテム一覧を再取得
        fetchReagentItems();
      }
    } catch (error) {
      console.error("Error in handleItemUsageEnd:", error);
    }
  };

  // 試薬の使用開始処理
  const handleUsageStart = async (reagentId: number) => {
    if (!confirm("この試薬の使用を開始しますか？")) {
      return;
    }
    
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("Error getting user:", userError);
        return;
      }
      
      const userId = userData.user.id;
      
      const { error } = await supabase
        .from("reagents")
        .update({
          used: true,
          used_at: new Date().toISOString(),
          used_by: userId,
        })
        .eq("id", reagentId)
        .eq("facility_id", profile?.facility_id); // 施設IDによる制限を追加
        
      if (error) {
        console.error("Error starting usage:", error);
      } else {
        // 試薬一覧を再取得
        fetchReagents();
      }
    } catch (error) {
      console.error("Error in handleUsageStart:", error);
    }
  };

  // 試薬の使用終了処理
  const handleUsageEnd = async (reagentId: number) => {
    if (!confirm("この試薬の使用を終了しますか？")) {
      return;
    }
    
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("Error getting user:", userError);
        return;
      }
      
      const userId = userData.user.id;
      
      const { error } = await supabase
        .from("reagents")
        .update({
          ended_at: new Date().toISOString(),
          ended_by: userId,
        })
        .eq("id", reagentId)
        .eq("facility_id", profile?.facility_id); // 施設IDによる制限を追加
        
      if (error) {
        console.error("Error ending usage:", error);
      } else {
        // 試薬一覧を再取得
        fetchReagents();
      }
    } catch (error) {
      console.error("Error in handleUsageEnd:", error);
    }
  };

  // すべての行を展開する
  const expandAllRows = () => {
    if (allExpanded) {
      // すでに全展開状態なら折りたたむ
      setExpandedReagents({});
      setAllExpanded(false);
    } else {
      // 全展開する
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
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#ffffff' }}>
        {/* 共通ヘッダーコンポーネントを使用 */}
        <AppHeader showBackButton={true} title="Clinical reagent manager" />

        <div className="bg-background border-b">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center" style={{ boxShadow: 'none' }}>
            <h2 className="text-2xl font-bold text-center w-full">Reagent Dashboard</h2>
          </div>
        </div>

        <main className="flex-grow container mx-auto px-4 py-8">
          {/* カレントユーザーの氏名表示 */}
          <div className="mb-4 text-right">
            {currentUserName && (
              <p className="text-sm text-gray-600">
                {currentUserName}さんがログインしています！
              </p>
            )}
          </div>

          {/* フィルター領域 - 右詰めに配置 */}
          <div className="mb-4 flex justify-end items-center space-x-4">
            <div>
              <label className="text-sm">部署フィルター: </label>
              <select
                className="border rounded p-1 text-sm"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                <option value="all">すべて</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center">
              <label className="text-sm mr-1">使用終了試薬表示:</label>
              <input
                type="checkbox"
                checked={showEnded}
                onChange={(e) => setShowEnded(e.target.checked)}
              />
            </div>
          </div>

          {/* 期限切れ通知エリア - 左揃えに修正 */}
          {expiryNotifications.length > 0 && (
            <div className="mb-6 p-4 border border-yellow-300 bg-yellow-50 rounded-md">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
                <AlertTriangle className="inline-block mr-2 h-5 w-5" />
                期限切れ間近の試薬 ({expiryNotifications.length}件)
              </h3>
              <div className="max-h-40 overflow-y-auto">
                <ul className="list-disc pl-5 text-left">
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

          <div className="mb-6 flex justify-between">
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompactMode(!compactMode)}
                className="flex items-center"
              >
                {compactMode ? "標準表示" : "コンパクト表示"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={expandAllRows}
                className="flex items-center"
              >
                {allExpanded ? "すべて折りたたむ" : "すべて展開"}
              </Button>
            </div>
            <Button
              onClick={() => router.push("/reagent/register")}
              className="bg-[hsl(12,6.5%,15.1%)] hover:bg-[hsl(12,6.5%,10%)] text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> Register Reagent
            </Button>
          </div>

          {/* ローディング表示 */}
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">データを読み込み中...</p>
              </div>
            </div>
          ) : (
            /* テーブルコンテナ */
            <Card className="border shadow-none">
              <div className="overflow-x-auto">
                <Table className={`w-max min-w-full ${compactMode ? 'text-xs' : ''}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={compactMode ? "w-8" : "w-10"}></TableHead>
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
                    {filteredReagents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-4">
                          <div>
                            <p className="mb-2">データがありません</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fetchAllData()}
                            >
                              データを再読み込み
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredReagents.map((reagent) => {
                        // この試薬パッケージに関連するアイテムを取得
                        const items = reagentItems.filter(item => item.reagent_package_id === reagent.id);
                        const hasItems = items.length > 0;
                        const isExpanded = expandedReagents[reagent.id] || false;
                        
                        return (
                          <React.Fragment key={reagent.id}>
                            <TableRow
                              onClick={() => handleRowClick(reagent)}
                              className={`cursor-pointer hover:bg-gray-50 ${compactMode ? 'h-8' : ''}`}
                            >
                              <TableCell>
                                {hasItems && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="p-0 h-6 w-6"
                                    onClick={(e) => toggleReagentExpand(reagent.id, e)}
                                  >
                                    {isExpanded ? '−' : '+'}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>{reagent.name}</TableCell>
                              <TableCell>{reagent.lotNo}</TableCell>
                              <TableCell>{reagent.specification}</TableCell>
                              <TableCell>{reagent.unit || "-"}</TableCell>
                              <TableCell>{formatDateTime(reagent.expirationDate)}</TableCell>
                              <TableCell>{formatDateTime(reagent.used_at)}</TableCell>
                              <TableCell>{formatDateTime(reagent.ended_at)}</TableCell>
                              <TableCell>
                                {reagent.used_by
                                  ? typeof reagent.used_by === "object"
                                    ? reagent.used_by.fullname
                                    : reagent.used_by
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                {reagent.ended_by
                                  ? typeof reagent.ended_by === "object"
                                    ? reagent.ended_by.fullname
                                    : reagent.ended_by
                                  : "-"}
                              </TableCell>
                              <TableCell>{formatDateTime(reagent.registrationDate)}</TableCell>
                              <TableCell>
                                {typeof reagent.registeredBy === "object"
                                  ? reagent.registeredBy.fullname
                                  : reagent.registeredBy}
                              </TableCell>
                              <TableCell>
                                {!reagent.used && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUsageStart(reagent.id);
                                    }}
                                  >
                                    使用開始
                                  </Button>
                                )}
                                {reagent.used && !reagent.ended_at && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUsageEnd(reagent.id);
                                    }}
                                  >
                                    使用終了
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            {/* アイテム行（展開時のみ表示） */}
                            {isExpanded && items.map(item => (
                              <TableRow key={`item-${item.id}`} className={`bg-gray-50 whitespace-nowrap ${compactMode ? 'h-7 text-xs' : ''}`}>
                                <TableCell></TableCell>
                                <TableCell className="pl-8 font-medium text-sm">
                                  └ {item.name}
                                </TableCell>
                                <TableCell colSpan={3}></TableCell>
                                <TableCell className="text-sm">
                                  {item.usagestartdate
                                    ? new Date(item.usagestartdate).toLocaleString()
                                    : "未設定"}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {item.ended_at
                                    ? new Date(item.ended_at).toLocaleString()
                                    : ""}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {item.user_fullname || item.user}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {item.ended_by_fullname || (item.ended_by ? item.ended_by : "")}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {new Date(item.created_at).toLocaleString()}
                                </TableCell>
                                <TableCell></TableCell>
                                <TableCell className="space-x-1 whitespace-nowrap">
                                  {!item.ended_at && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => handleItemUsageEnd(item.id, e)}
                                    >
                                      使用終了
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
