"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/ui/app-header";
import { getJstTimestamp } from "@/lib/utils";

type FormValues = {
  reagent_id: string;
};

export default function ReagentUse() {
  const { user, profile } = useAuth();
  const { register, handleSubmit } = useForm<FormValues>();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (data: FormValues) => {
    try {
      setMessage("");
      setError("");

      // 施設IDが設定されていない場合はエラー
      if (!profile?.facility_id) {
        setError("施設IDが設定されていません。管理者に連絡してください。");
        return;
      }

      // 試薬が自分の施設のものか確認
      const { data: reagentData, error: reagentError } = await supabase
        .from("reagents")
        .select("id, facility_id")
        .eq("id", data.reagent_id)
        .eq("facility_id", profile.facility_id)
        .single();

      if (reagentError || !reagentData) {
        setError("指定された試薬が見つからないか、アクセス権限がありません。");
        return;
      }

      // 試薬の使用状態を更新
      const { error: updateError } = await supabase
        .from("reagents")
        .update({
          used: true,
          used_at: getJstTimestamp(),
          used_by: user?.id
        })
        .eq("id", data.reagent_id)
        .eq("facility_id", profile.facility_id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // 使用履歴を記録
      if (user?.id) {
        const { error: historyError } = await supabase
          .from("usage_history")
          .insert([
            {
              reagent_id: data.reagent_id,
              user_id: user.id,
              used_at: getJstTimestamp(),
              facility_id: profile.facility_id
            },
          ]);

        if (historyError) {
          setError(historyError.message);
          return;
        }
      }

      setMessage("試薬使用が記録されました。");
      setTimeout(() => {
        router.push("/reagent_dash");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "エラーが発生しました");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
      <AppHeader showBackButton={true} title="試薬使用登録" />
      
      <div className="container mx-auto p-4">
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle>試薬使用登録</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reagent_id">試薬ID</Label>
                <Input
                  id="reagent_id"
                  type="text"
                  placeholder="試薬IDを入力"
                  {...register("reagent_id", { required: true })}
                />
                <p className="text-sm text-gray-500">
                  ※試薬パッケージに記載されているIDを入力してください
                </p>
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-md">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              
              {message && (
                <div className="p-3 bg-green-50 border border-green-300 rounded-md">
                  <p className="text-sm text-green-700">{message}</p>
                </div>
              )}
              
              <Button type="submit" className="w-full">
                使用開始を記録
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
