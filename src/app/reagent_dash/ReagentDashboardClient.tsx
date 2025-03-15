"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function ReagentDashboardClient() {
  const { profile, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [reagentItems, setReagentItems] = useState<ReagentItem[]>([]); // 試薬アイテムの状態を追加
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState(""); // 施設名の状態を追加
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
  // ローディング状態とエラー管理（UIに表示するために使用）
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 読み込み開始時間を追跡するための状態
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  // 自動リロードのタイマーID
  const [autoReloadTimerId, setAutoReloadTimerId] = useState<NodeJS.Timeout | null>(null);

  // 背景色を白色に変更
  useEffect(() => {
    const body = document.querySelector('body');
    if (!body) return;

    // 元のbodyスタイルを保存
    const originalBackgroundColor = body.style.backgroundColor;
    const originalBackgroundImage = body.style.backgroundImage;
    const originalColor = body.style.color;
    
    // このページ用にbodyスタイルを変更
    body.style.backgroundColor = 'white'; // 白色に変更
    body.style.backgroundImage = 'none';
    body.style.color = '#333333';

    return () => {
      // クリーンアップ時に元のスタイルに戻す
      body.style.backgroundColor = originalBackgroundColor;
      body.style.backgroundImage = originalBackgroundImage;
      body.style.color = originalColor;
    };
  }, []);

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
    
    // データ取得前にローディング状態を設定
    setIsLoading(true);
    setError(null);
    // 読み込み開始時間を記録
    setLoadingStartTime(Date.now());
    
    console.log("ReagentDash: マスターデータとデータの取得を開始");
    
    // 非同期処理を実行
    const fetchData = async () => {
      try {
        // マスターデータを先に読み込む
        await loadReagentMasterData();
        
        // マスターデータ読み込み後に試薬データを取得
        await fetchReagents();
        
        // ユーザープロファイルを取得
        await fetchCurrentUserProfile();
        
        // すべての取得が完了したらローディング状態を解除
        setIsLoading(false);
        // 読み込み完了したのでタイマーをクリア
        setLoadingStartTime(null);
        if (autoReloadTimerId) {
          clearTimeout(autoReloadTimerId);
          setAutoReloadTimerId(null);
        }
      } catch (err) {
        console.error("ReagentDash: データ取得中にエラーが発生:", err);
        setError("データの取得中にエラーが発生しました。");
        setIsLoading(false);
        // エラー発生時も読み込み時間をリセット
        setLoadingStartTime(null);
        if (autoReloadTimerId) {
          clearTimeout(autoReloadTimerId);
          setAutoReloadTimerId(null);
        }
      }
    };
    
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile?.facility_id]);

  // 自動リロード用のuseEffect
  useEffect(() => {
    // 読み込み開始時間が設定されていて、まだローディング中の場合
    if (loadingStartTime && isLoading) {
      // 15秒後に自動リロードするタイマーを設定
      const timerId = setTimeout(() => {
        console.log("ReagentDash: データ読み込みが長時間かかっているため、ページを自動リロードします");
        // 現在のURLを取得してリロード
        window.location.reload();
      }, 15000); // 15秒後

      setAutoReloadTimerId(timerId);

      // クリーンアップ関数
      return () => {
        if (timerId) {
          clearTimeout(timerId);
        }
      };
    }
  }, [loadingStartTime, isLoading]);

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

  // 試薬名をマスターデータから取得する関数
  const getReagentNameByCode = useCallback((code: string): string => {
    if (!code) return '';
    
    const masterData = reagentMasterData[code];
    if (masterData) {
      return masterData.name;
    }
    
    return code; // マスターデータに存在しない場合はコードをそのまま返す
  }, [reagentMasterData]);

  // ユーザーIDからフルネームを取得する関数
  const getUserFullname = useCallback((userId: string) => {
    // プロファイル情報からユーザー名を取得
    try {
      // ユーザーIDがない場合は空文字を返す
      if (!userId) return "";
      
      console.log("ReagentDash: ユーザー名取得", { userId });
      
      // ここでユーザー情報を取得するロジックを実装
      // 本来はAPIリクエストなどで取得するが、現在はダミーデータを返す
      return `ユーザー(${userId.substring(0, 8)})`;
    } catch (err) {
      console.error("ReagentDash: ユーザー名取得エラー:", err);
      return "";
    }
  }, []);

  // 試薬アイテムの取得
  const fetchReagentItems = useCallback(async () => {
    if (!profile?.facility_id) {
      console.log("ReagentDash: fetchReagentItems - 施設IDがないためスキップ");
      return;
    }

    console.log("ReagentDash: 試薬アイテムの取得を開始", { 
      facilityId: profile.facility_id,
      timestamp: new Date().toISOString()
    });

    try {
      console.log("ReagentDash: 試薬アイテムクエリ実行前", { 
        facilityId: profile.facility_id,
        timestamp: new Date().toISOString(),
        table: "reagent_items"
      });

      // 明示的にセッションを確認
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("ReagentDash: アイテム取得前のセッション確認", {
        hasSession: !!sessionData.session,
        userId: sessionData.session?.user?.id || "なし",
        accessToken: sessionData.session?.access_token ? "あり" : "なし"
      });

      if (!sessionData.session) {
        console.error("ReagentDash: セッションが無効です。アイテム取得をスキップします。");
        return;
      }

      const { data, error } = await supabase
        .from("reagent_items")
        .select(`*, reagent_package_id`)
        .order("created_at", { ascending: false });

      console.log("ReagentDash: 試薬アイテムクエリ実行結果", { 
        success: !error, 
        error: error?.message || 'なし',
        dataReceived: !!data,
        count: data?.length || 0,
        timestamp: new Date().toISOString()
      });

      if (error) {
        console.error("ReagentDash: 試薬アイテム取得エラー:", error);
        return;
      }

      if (!data || data.length === 0) {
        console.log("ReagentDash: 取得した試薬アイテムデータが空です");
        setReagentItems([]);
        return;
      }

      console.log("ReagentDash: 試薬アイテム取得成功", { 
        count: data.length,
        firstItem: data[0] ? JSON.stringify(data[0]).substring(0, 100) + '...' : 'なし'
      });

      // ユーザー名を設定
      const itemsWithUserNames = data.map(item => {
        return {
          ...item,
          user_fullname: item.user ? getUserFullname(item.user) : null,
          ended_by_fullname: item.ended_by ? getUserFullname(item.ended_by) : null
        };
      });

      console.log("ReagentDash: 試薬アイテム処理完了", { 
        processedCount: itemsWithUserNames.length,
        setStateTimestamp: new Date().toISOString()
      });

      setReagentItems(itemsWithUserNames);
    } catch (err) {
      console.error("ReagentDash: 試薬アイテム取得中に例外が発生:", err);
      setError("試薬アイテムの取得中にエラーが発生しました");
    }
  }, [profile?.facility_id, getUserFullname]);

  // 試薬データの取得（profiles との join で各ユーザー情報を取得）
  const fetchReagents = useCallback(async () => {
    if (!profile?.facility_id) {
      console.log("ReagentDash: fetchReagents - 施設IDがないためスキップ");
      return;
    }

    console.log("ReagentDash: 試薬データの取得を開始", { 
      facilityId: profile.facility_id,
      timestamp: new Date().toISOString()
    });

    try {
      // データ取得前のデバッグログ
      console.log("ReagentDash: Supabaseクエリ実行前", { 
        facilityId: profile.facility_id,
        timestamp: new Date().toISOString(),
        table: "reagents",
        query: "select * from reagents where facility_id = '" + profile.facility_id + "'"
      });

      // 明示的にセッションを確認
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("ReagentDash: データ取得前のセッション確認", {
        hasSession: !!sessionData.session,
        userId: sessionData.session?.user?.id || "なし",
        accessToken: sessionData.session?.access_token ? "あり" : "なし"
      });

      if (!sessionData.session) {
        console.error("ReagentDash: セッションが無効です。データ取得をスキップします。");
        return;
      }

      // 明示的にアクセストークンを設定
      const { data, error } = await supabase
        .from("reagents")
        .select(`*, registeredBy (fullname), used_by (fullname), ended_by (fullname)`)
        .eq("facility_id", profile.facility_id)
        .order("registrationDate", { ascending: false });

      // クエリ結果のデバッグログ
      console.log("ReagentDash: Supabaseクエリ実行結果", { 
        success: !error, 
        error: error?.message || 'なし',
        dataReceived: !!data,
        count: data?.length || 0,
        timestamp: new Date().toISOString()
      });

      if (error) {
        console.error("ReagentDash: 試薬データ取得エラー:", error);
        setError("試薬データの取得中にエラーが発生しました: " + error.message);
        return;
      }
      
      // データが空の場合のログ
      if (!data || data.length === 0) {
        console.log("ReagentDash: 取得した試薬データが空です");
        setReagents([]);
        return;
      }
      
      console.log("ReagentDash: 試薬データ取得成功", { 
        count: data.length,
        firstItem: data[0] ? JSON.stringify(data[0]).substring(0, 100) + '...' : 'なし'
      });
      
      // 試薬名をマスターデータから取得して設定
      const reagentsWithNames = (data || []).map(reagent => {
        // nameフィールドがコードの場合、マスターデータから名前を取得
        if (reagent.name && reagent.name.match(/^[A-Z0-9-]+$/)) {
          const masterName = getReagentNameByCode(reagent.name);
          console.log(`ReagentDash: 試薬名マッピング - コード: ${reagent.name}, マスター名: ${masterName || 'なし'}`);
          return {
            ...reagent,
            originalCode: reagent.name, // 元のコードを保存
            name: masterName || reagent.name
          };
        }
        return reagent;
      });
      
      console.log("ReagentDash: 試薬データ処理完了", { 
        processedCount: reagentsWithNames.length,
        setStateTimestamp: new Date().toISOString()
      });
      
      setReagents(reagentsWithNames);
      
      // 期限切れ通知を更新
      checkExpiryNotifications(reagentsWithNames);
      
      // 試薬アイテムも取得
      fetchReagentItems();
    } catch (err) {
      console.error("ReagentDash: 試薬データ取得中に例外が発生:", err);
    }
  }, [profile?.facility_id, getReagentNameByCode, fetchReagentItems]);

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

  // カレントユーザーの氏名取得
  const fetchCurrentUserProfile = async () => {
    if (!user) return;
    try {
      // プロファイル情報を取得
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("fullname, facility_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("プロファイル取得エラー:", profileError);
        return;
      }

      if (profileData) {
        setCurrentUserName(profileData.fullname || "");
        
        // 施設情報を取得
        if (profileData.facility_id) {
          const { data: facilityData, error: facilityError } = await supabase
            .from("facilities")
            .select("name")
            .eq("id", profileData.facility_id)
            .single();
            
          if (!facilityError && facilityData) {
            setFacilityName(facilityData.name);
          }
        }
      }
    } catch (error) {
      console.error("ユーザープロファイル取得エラー:", error);
    }
  };

  // visibilitychangeイベントのリスナー
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchReagents();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // セッション確認と復元処理
  useEffect(() => {
    const checkAndRestoreSession = async () => {
      try {
        console.log("ReagentDash: セッション確認を開始");
        
        // 現在のセッションを確認
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        console.log("ReagentDash: セッション確認結果:", { 
          hasSession: !!sessionData.session,
          userId: sessionData.session?.user?.id || "なし",
          error: sessionError?.message || "なし"
        });
        
        if (sessionError) {
          console.error("ReagentDash: セッション確認エラー:", sessionError);
          router.push('/login');
          return;
        }
        
        if (!sessionData.session) {
          console.log("ReagentDash: セッションなし、ログインページへリダイレクト");
          router.push('/login');
          return;
        }
        
        console.log("ReagentDash: 有効なセッションを確認:", sessionData.session.user.id);
        
        // ユーザー情報あり
        if (user) {
          console.log("ReagentDash: ユーザー情報あり:", user.id);
        } else {
          console.log("ReagentDash: ユーザー情報なし、認証コンテキストと不一致");
        }
      } catch (e) {
        console.error("ReagentDash: セッション確認中にエラー発生:", e);
        router.push('/login');
      }
    };
    
    // ページロード時にセッション確認を実行
    checkAndRestoreSession();
  }, [router, user]);

  return (
    <TooltipProvider>
      <div style={{ backgroundColor: 'white', minHeight: '100vh' }}>
        {/* 共通ヘッダーコンポーネントを使用 */}
        <AppHeader showBackButton={true} title="Clinical reagent manager" />

        <div className="bg-background border-b">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold">Reagent Dashboard</h2>
            {/* フィルター領域 */}
            <div className="flex items-center space-x-4">
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
          </div>
        </div>

        <main className="flex-grow container mx-auto px-4 py-8" style={{ backgroundColor: '#ffffff' }}>
          {/* カレントユーザーの氏名表示 */}
          <div className="mb-4 text-right">
            {facilityName && (
              <p className="text-sm text-gray-600">
                施設「{facilityName}」
              </p>
            )}
            {currentUserName && (
              <p className="text-sm text-gray-600">
                {currentUserName}さんがログインしています！
              </p>
            )}
          </div>

          {/* ローディング状態とエラー表示 */}
          {isLoading && (
            <div className="mb-6 p-4 border border-blue-300 bg-blue-50 rounded-md">
              <p className="text-blue-700">データを読み込み中です... {loadingStartTime && (
                <span>（長時間かかる場合は自動的にリロードされます）</span>
              )}</p>
            </div>
          )}
          
          {error && (
            <div className="mb-6 p-4 border border-red-300 bg-red-50 rounded-md">
              <p className="text-red-700">{error}</p>
              <Button 
                onClick={() => window.location.reload()} 
                className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                size="sm"
              >
                ページをリロード
              </Button>
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
                onClick={expandAllRows}
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
            <Button
              onClick={() => router.push(`/reagent/register-new?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`)}
              className="bg-[hsl(12,6.5%,15.1%)] hover:bg-[hsl(12,6.5%,10%)] text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> Register Reagent
            </Button>
          </div>

          <Card>
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
                    // この試薬パッケージに関連するアイテムを取得
                    const items = reagentItems.filter(item => item.reagent_package_id === reagent.id);
                    const hasItems = items.length > 0;
                    const isExpanded = expandedReagents[reagent.id] || false;
                    
                    return (
                      <React.Fragment key={reagent.id}>
                        <TableRow
                          onClick={() => handleRowClick(reagent)}
                          className={`cursor-pointer hover:bg-gray-50 whitespace-nowrap ${compactMode ? 'h-8' : ''}`}
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
                          <TableCell className="space-x-1 whitespace-nowrap">
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/reagent/${reagent.id}`);
                              }}
                              className="ml-1"
                            >
                              アイテム追加
                            </Button>
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
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </main>

        <footer className="bg-background border-t">
          <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
            © 2025 Your side partner. All rights reserved.
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
