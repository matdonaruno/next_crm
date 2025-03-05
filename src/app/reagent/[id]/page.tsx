"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
import { useRequireAuth } from "@/hooks/useRequireAuth";

type ReagentItemFormValues = {
  name: string;
  usageStartDate: string;
  user: string;
};

interface Reagent {
  id: number;
  name: string;
  department: string;
  lotNo: string;
  specification: string;
  expirationDate: string;
  registrationDate: string;
  registeredBy: string;
  used_at: string;
  ended_at: string;
  used: boolean;
}

interface ItemType {
  id: number;
  name: string;
  usageStartDate: string;
  user: string;
  created_at: string;
}

export default function ReagentDetailPage() {
    useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const reagentId = params?.id;
  const [reagent, setReagent] = useState<Reagent | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
  } = useForm<ReagentItemFormValues>();

  const fetchReagent = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reagents")
      .select("*")
      .eq("id", reagentId)
      .single();
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setReagent(data);
      setLoading(false);
    }
  }, [reagentId]);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("reagent_items")
      .select("*")
      .eq("reagent_package_id", reagentId);
    if (error) {
      console.error("Error fetching items:", error.message);
    } else {
      setItems(data || []);
    }
  }, [reagentId]);

  useEffect(() => {
    if (reagentId) {
      fetchReagent();
      fetchItems();
    }
  }, [reagentId, fetchReagent, fetchItems]);

  // 使用終了ボタン押下時の処理
  const handleUsageEnd = async () => {
    const { error } = await supabase
      .from("reagents")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", reagentId);
    if (error) {
      console.error("Error updating usage end:", error.message);
    } else {
      fetchReagent();
    }
  };

  // 試薬アイテム登録フォーム送信時の処理
  const onSubmit = async (data: ReagentItemFormValues) => {
    // 現在のユーザー情報を取得（必要に応じて、profiles から取得する実装も可能です）
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError("ユーザー情報の取得に失敗しました");
      return;
    }
    // ※ 利用者はフォーム入力の値（user）をそのまま使用しています
    const { error } = await supabase
      .from("reagent_items")
      .insert([
        {
          reagent_package_id: reagentId,
          name: data.name,
          usageStartDate: data.usageStartDate,
          user: data.user,
        },
      ]);
    if (error) {
      setError(error.message);
    } else {
      reset();
      fetchItems();
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
            {new Date(reagent.registrationDate).toLocaleString()}
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
                {...register("usageStartDate", { required: true })}
              />
            </div>
            <div>
              <Label htmlFor="user">利用者</Label>
              <Input id="user" {...register("user", { required: true })} />
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
                    {item.usageStartDate
                      ? new Date(item.usageStartDate).toLocaleString()
                      : "未設定"}
                  </p>
                  <p>
                    <strong>利用者:</strong> {item.user}
                  </p>
                  <p>
                    <strong>登録日時:</strong>{" "}
                    {new Date(item.created_at).toLocaleString()}
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
