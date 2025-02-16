"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRequireAuth } from "@/hooks/useRequireAuth";

type FormValues = {
  reagent_id: string;
};

export default function ReagentUse() {
  useRequireAuth();
  const { register, handleSubmit } = useForm<FormValues>();
  const router = useRouter();
  const [message, setMessage] = useState("");

  const onSubmit = async (data: FormValues) => {
    const { error } = await supabase
      .from("reagents")
      .update({
        used: true,
        used_at: new Date().toISOString(),
      })
      .eq("id", data.reagent_id);
    if (error) {
      setMessage(error.message);
      return;
    }
    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id;
    if (userId) {
      await supabase.from("usage_history").insert([
        {
          reagent_id: data.reagent_id,
          user_id: userId,
          used_at: new Date().toISOString(),
        },
      ]);
    }
    setMessage("試薬使用が記録されました。");
    router.push("/");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>試薬使用</CardTitle>
        </CardHeader>
        <CardContent>
          {message && <p className="mb-4 text-green-600">{message}</p>}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="reagent_id">
                試薬ID（バーコードスキャンまたは手動入力）
              </Label>
              <Input id="reagent_id" {...register("reagent_id", { required: true })} />
            </div>
            <Button type="submit" className="w-full">
              使用済みにする
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
