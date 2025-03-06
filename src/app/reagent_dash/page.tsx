"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Plus,
  Beaker,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Trash2,
  User,
  LogOut,
  Home,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/hooks/useRequireAuth";

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
}

type NotificationType = "nearExpiry" | "expired" | "newRegistration" | "deletion";

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  timestamp: Date;
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
  useRequireAuth();
  const router = useRouter();
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: "nearExpiry",
      message: "試薬 A の有効期限が近づいています",
      timestamp: new Date(),
    },
    {
      id: 2,
      type: "expired",
      message: "試薬 B が期限切れです",
      timestamp: new Date(),
    },
    {
      id: 3,
      type: "newRegistration",
      message: "新しい試薬 C が登録されました",
      timestamp: new Date(),
    },
    {
      id: 4,
      type: "deletion",
      message: "試薬 D が削除されました",
      timestamp: new Date(),
    },
  ]);
  const [currentUserName, setCurrentUserName] = useState("");
  // フィルター用の状態
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [showEnded, setShowEnded] = useState(false);

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

  // 試薬データの取得（profiles との join で各ユーザー情報を取得）
  const fetchReagents = async () => {
    const { data, error } = await supabase
      .from("reagents")
      .select(`*, registeredBy (fullname), used_by (fullname), ended_by (fullname)`)
      .order("registrationDate", { ascending: false });
    if (error) {
      console.error("Error fetching reagents:", error);
    } else {
      setReagents(data || []);
    }
  };

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

  useEffect(() => {
    fetchReagents();
    fetchCurrentUserProfile();
  }, []);

  // 通知アイコンの定義
  const notificationIcons: Record<NotificationType, React.ReactElement> = {
    nearExpiry: <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2" />,
    expired: <XCircle className="h-4 w-4 text-red-500 mr-2" />,
    newRegistration: <CheckCircle className="h-4 w-4 text-green-500 mr-2" />,
    deletion: <Trash2 className="h-4 w-4 text-blue-500 mr-2" />,
  };

  // 使用開始登録：used, used_at, used_by を更新
  const handleUsageStart = async (reagentId: number) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error("Error fetching user:", userError);
      return;
    }
    const currentUserId = userData.user.id;
    const { error } = await supabase
      .from("reagents")
      .update({
        used: true,
        used_at: new Date().toISOString(),
        used_by: currentUserId,
      })
      .eq("id", reagentId);
    if (error) {
      console.error("Error updating usage start:", error.message);
    } else {
      fetchReagents();
    }
  };

  // 使用終了登録：ended_at, ended_by を更新
  const handleUsageEnd = async (reagentId: number) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error("Error fetching user:", userError);
      return;
    }
    const currentUserId = userData.user.id;
    const { error } = await supabase
      .from("reagents")
      .update({
        ended_at: new Date().toISOString(),
        ended_by: currentUserId,
      })
      .eq("id", reagentId);
    if (error) {
      console.error("Error updating usage end:", error.message);
    } else {
      fetchReagents();
    }
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

  // フィルタリング後の試薬一覧
  const filteredReagents = useMemo(() => {
    return reagents.filter((r) => {
      const matchesDept =
        selectedDepartment === "all" || r.department === selectedDepartment;
      const matchesEnded = showEnded ? true : !r.ended_at;
      return matchesDept && matchesEnded;
    });
  }, [reagents, selectedDepartment, showEnded]);

  return (
    <TooltipProvider>
      <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
        <header className="bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center">
              <Beaker className="h-6 w-6 mr-2" />
              <h1 className="text-xl font-bold">Clinical reagent manager</h1>
            </div>
            <div className="flex items-center space-x-2">
              {/* ユーザー設定アイコン */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => router.push("/user-settings")}>
                    <User className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>ユーザー設定</p>
                </TooltipContent>
              </Tooltip>
              {/* ホーム（ダッシュボード）アイコン */}
              <Tooltip>
                <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/depart")}
                  >
                    <Home className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>ダッシュボード</p>
                </TooltipContent>
              </Tooltip>
              {/* 通知アイコン */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="relative">
                        <Bell className="h-5 w-5" />
                        {notifications.length > 0 && (
                          <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                            {notifications.length}
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80">
                      {notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <DropdownMenuItem key={notification.id} className="flex items-start">
                            {notificationIcons[notification.type]}
                            <div className="flex flex-col">
                              <span>{notification.message}</span>
                              <span className="text-xs text-muted-foreground">
                                {notification.timestamp.toLocaleString()}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <DropdownMenuItem className="text-center">通知はありません</DropdownMenuItem>
                      )}
                      {notifications.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setNotifications([])}>
                            すべて既読にする
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent>
                  <p>通知</p>
                </TooltipContent>
              </Tooltip>
              {/* ログアウトアイコン */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      router.push("/login");
                    }}
                  >
                    <LogOut className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>ログアウト</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

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
            {currentUserName && (
              <p className="text-sm text-gray-600">
                {currentUserName}さんがログインしています！
              </p>
            )}
          </div>
          <div className="mb-6 flex justify-end">
            <Button
              onClick={() => router.push("/reagent/register")}
              className="bg-[hsl(12,6.5%,15.1%)] hover:bg-[hsl(12,6.5%,10%)] text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> Register Reagent
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[6rem]">試薬名</TableHead>
                  <TableHead className="min-w-[4rem]">Lot No.</TableHead>
                  <TableHead className="min-w-[5rem]">規格</TableHead>
                  <TableHead className="min-w-[4rem]">単位</TableHead>
                  <TableHead className="min-w-[6rem]">有効期限</TableHead>
                  <TableHead className="min-w-[6rem] bg-primary/10 font-bold">使用開始日</TableHead>
                  <TableHead className="min-w-[6rem] bg-primary/10 font-bold">使用終了日</TableHead>
                  <TableHead className="min-w-[4rem]">使用入力者</TableHead>
                  <TableHead className="min-w-[4rem]">終了入力者</TableHead>
                  <TableHead className="min-w-[6rem]">登録日</TableHead>
                  <TableHead className="min-w-[4rem]">登録者</TableHead>
                  <TableHead className="min-w-[8rem]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReagents.map((reagent) => (
                  <TableRow
                    key={reagent.id}
                    onClick={() => handleRowClick(reagent)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
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
                      {reagent.used ? (
                        <>
                          {reagent.ended_at ? (
                            <span className="text-sm text-gray-500">使用終了済み</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("使用終了登録を行いますか？")) {
                                  handleUsageEnd(reagent.id);
                                }
                              }}
                            >
                              使用終了登録
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm("使用開始登録を行いますか？")) {
                              handleUsageStart(reagent.id);
                            }
                          }}
                        >
                          使用開始登録
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/reagent/${reagent.id}`);
                        }}
                        className="ml-2"
                      >
                        アイテム追加
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
