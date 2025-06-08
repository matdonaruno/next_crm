"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSupabase } from '@/app/_providers/supabase-provider';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { Home } from "lucide-react";
import { getJstTimestamp } from "@/lib/utils";

type ReagentItemFormValues = {
  name: string;
  usageStartDate: string;
  user: string;
};

interface Reagent {
  id: number;
  name: string;
  department: string | null;
  lotNo: string | null;
  specification: string | null;
  expirationDate: string | null;
  registrationDate: string | null;
  registeredBy: string | null;
  used_at: string | null;
  ended_at: string | null;
  used: boolean | null;
  facility_id: string | null;
}

interface ItemType {
  id: number;
  name: string;
  usagestartdate: string | null;
  user: string | null;
  user_fullname?: string | null;
  created_at: string | null;
  facility_id: string | null;
}

export default function ReagentDetailPage() {
  const { supabase, session } = useSupabase();
  const router = useRouter();
  const params = useParams();
  const idParam = params?.id;
  if (!idParam || Array.isArray(idParam)) {
    return <p>無効な試薬IDです。</p>;
  }
  const reagentId = Number(idParam);
  const [reagent, setReagent] = useState<Reagent | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // 今日の日付をYYYY-MM-DD形式で取得
  const today = new Date().toISOString().split('T')[0];
  
  const {
    register,
    handleSubmit,
    reset,
  } = useForm<ReagentItemFormValues>({
    defaultValues: {
      usageStartDate: today // デフォルトで今日の日付を設定
    }
  });

  const fetchReagent = useCallback(async () => {
    setLoading(true);

    if (!session?.user) {
      setError("ユーザー情報の取得に失敗しました");
      setLoading(false);
      return;
    }
    const userId = session.user.id;
    
    // ユーザーのプロファイルから施設IDを取得
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("facility_id")
      .eq("id", userId)
      .single();
      
    if (profileError || !profileData?.facility_id) {
      setError("施設情報の取得に失敗しました");
      setLoading(false);
      return;
    }
    
    // 施設IDに基づいて試薬を取得
    const { data, error } = await supabase
      .from("reagents")
      .select("*")
      .eq("id", reagentId)
      .eq("facility_id", profileData.facility_id)
      .single();
      
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setReagent({
        ...data,
        department: data.department ?? null,
        lotNo: data.lotNo ?? null,
        specification: data.specification ?? null,
        expirationDate: data.expirationDate ?? null,
        registrationDate: data.registrationDate ?? null,
        registeredBy: data.registeredBy ?? null,
        used_at: data.used_at ?? null,
        ended_at: data.ended_at ?? null,
        facility_id: data.facility_id ?? null,
        used: data.used ?? null,
      });
      setLoading(false);
    }
  }, [reagentId, supabase, session]);

  const fetchItems = useCallback(async () => {
    if (!session?.user) {
      console.error("ユーザー情報の取得に失敗しました");
      return;
    }
    const userId = session.user.id;
    
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("facility_id")
      .eq("id", userId)
      .single();
      
    if (profileError || !profileData?.facility_id) {
      console.error("施設情報の取得に失敗しました");
      return;
    }
    
    const { data, error } = await supabase
      .from("reagent_items")
      .select("*")
      .eq("reagent_package_id", reagentId)
      .eq("facility_id", profileData.facility_id);
      
    if (error) {
      console.error("Error fetching items:", error.message);
    } else {
      // 各アイテムのユーザー情報を取得
      const itemsWithUserInfo = await Promise.all((data || []).map(async (item) => {
        if (item.user) {
          // ユーザーIDからプロフィール情報を取得
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("fullname")
            .eq("id", item.user)
            .single();
            
          if (!profileError && profileData) {
            return {
              ...item,
              usagestartdate: item.usagestartdate ?? null,
              user: item.user ?? null,
              facility_id: item.facility_id ?? null,
              user_fullname: profileData.fullname ?? null,
            };
          }
        }
        return item;
      }));
      
      setItems(itemsWithUserInfo);
    }
  }, [reagentId, supabase, session]);

  useEffect(() => {
    if (reagentId) {
      fetchReagent();
      fetchItems();
    }
  }, [reagentId, fetchReagent, fetchItems]);

  // 使用終了ボタン押下時の処理
  const handleUsageEnd = async () => {
    try {
      if (!session?.user) {
        setError("ユーザー情報の取得に失敗しました");
        return;
      }
      const userId = session.user.id;
      
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("facility_id")
        .eq("id", userId)
        .single();
        
      if (profileError || !profileData?.facility_id) {
        setError("施設情報の取得に失敗しました");
        return;
      }
      
      // 試薬の使用終了を記録
      const { error } = await supabase
        .from("reagents")
        .update({
          ended_at: getJstTimestamp(),
          ended_by: userId,
        })
        .eq("id", reagentId)
        .eq("facility_id", profileData.facility_id);

      if (error) {
        setError(error.message);
      } else {
        fetchReagent();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(errorMessage);
    }
  };

  // 試薬アイテム登録フォーム送信時の処理
  const onSubmit = async (data: ReagentItemFormValues) => {
    try {
      if (!reagent) {
        setError("試薬情報の取得に失敗しました");
        return;
      }
      if (!session?.user) {
        setError("ユーザー情報の取得に失敗しました");
        return;
      }
      const userId = session.user.id;
      
      // 試薬アイテムの登録
      const { error } = await supabase.from("reagent_items").insert([
        {
          name: data.name,
          usagestartdate: data.usageStartDate,
          reagent_package_id: reagent.id,
          user: userId,
          facility_id: reagent.facility_id,
          created_at: getJstTimestamp() // 日本時間のタイムスタンプ
        },
      ]);

      if (error) {
        setError(error.message);
      } else {
        fetchItems();
        // フォームをリセット
        reset({
          name: "",
          usageStartDate: today,
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(errorMessage);
    }
  };

  if (loading) return <p>読み込み中...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!reagent) return <p>データが見つかりませんでした。</p>;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      {/* 右上にダッシュボードへ戻るボタン */}
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/depart")}>
          <Home className="h-6 w-6" />
        </Button>
      </div>

      <h1 className="text-2xl font-bold mb-6">Register Reagent for items</h1>

      {/* 試薬パッケージ詳細カード */}
      <Card className="w-full max-w-md mb-6">
        <CardHeader>
          <CardTitle>試薬パッケージ詳細</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            <strong>部署名:</strong> {reagent.department}
          </p>
          <p>
            <strong>試薬名:</strong> {reagent.name}
          </p>
          <p>
            <strong>ロット番号:</strong> {reagent.lotNo}
          </p>
          <p>
            <strong>規格:</strong> {reagent.specification}
          </p>
          <p>
            <strong>有効期限:</strong> {reagent.expirationDate}
          </p>
          <p>
            <strong>登録日:</strong>{" "}
            {reagent.registrationDate ? new Date(reagent.registrationDate).toLocaleString() : ""}
          </p>
          <p>
            <strong>登録者:</strong> {reagent.registeredBy}
          </p>
          <p>
            <strong>使用開始日:</strong>{" "}
            {reagent.used_at
              ? new Date(reagent.used_at).toLocaleString()
              : "未開始"}
          </p>
          <p>
            <strong>使用終了日:</strong>{" "}
            {reagent.ended_at
              ? new Date(reagent.ended_at).toLocaleString()
              : "未終了"}
          </p>
          {reagent.used && !reagent.ended_at && (
            <Button onClick={handleUsageEnd} className="mt-4">
              使用終了
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 試薬アイテム登録カード */}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>試薬アイテム登録</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Label htmlFor="name">アイテム名</Label>
              <Input id="name" {...register("name", { required: true })} />
            </div>
            <div>
              <Label htmlFor="usageStartDate">使用開始日</Label>
              <Input
                id="usageStartDate"
                type="date"
                defaultValue={today}
                {...register("usageStartDate", { required: true })}
              />
            </div>
            <div>
              <Label htmlFor="user">利用者</Label>
              <p className="text-sm text-gray-600 mt-1">{session?.user?.email || ''}</p>
              <input type="hidden" {...register("user")} value={session?.user?.id || ''} />
            </div>
            <Button type="submit" className="w-full">
              アイテム追加
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 試薬アイテム一覧カード */}
      <Card className="w-full max-w-md mt-6">
        <CardHeader>
          <CardTitle>試薬アイテム一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p>試薬アイテムはありません。</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="mb-2 border-b pb-2">
                  <p>
                    <strong>名前:</strong> {item.name}
                  </p>
                  <p>
                    <strong>使用開始日:</strong>{" "}
                    {item.usagestartdate
                      ? new Date(item.usagestartdate).toLocaleString()
                      : "未設定"}
                  </p>
                  <p>
                    <strong>利用者:</strong> {item.user_fullname || item.user}
                  </p>
                  <p>
                    <strong>登録日時:</strong>{" "}
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
