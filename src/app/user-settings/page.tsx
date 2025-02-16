"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { User } from "@supabase/supabase-js";

type FormValues = {
  firstName: string;
  lastName: string;
};

export default function UserSettings() {
    useRequireAuth();
  const { register, handleSubmit, setValue } = useForm<FormValues>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        setError("ユーザー情報の取得に失敗しました");
        return;
      }
      setCurrentUser(userData.user);
      const { firstName, lastName } = userData.user.user_metadata;
      setValue("firstName", firstName || "");
      setValue("lastName", lastName || "");
    };
    fetchUserInfo();
  }, [setValue]);

  const onSubmit = async (data: FormValues) => {
    // Auth の user_metadata を更新
    const { error } = await supabase.auth.updateUser({
      data: { 
        firstName: data.firstName, 
        lastName: data.lastName, 
        fullName: `${data.firstName} ${data.lastName}` 
      },
    });
    if (error) {
      setError(error.message);
    } else if (currentUser) {
      // profiles テーブルも更新する
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ fullname: `${data.firstName} ${data.lastName}` })
        .eq("id", currentUser.id);
      if (profileError) {
        setError(profileError.message);
      } else {
        setMessage("更新が完了しました。");
      }
    }
  };

  return (
    <div className="relative container mx-auto p-4 space-y-4">
      {/* ダッシュボードへ戻るボタン */}
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
          <Home className="h-6 w-6" />
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-6">User Settings</h1>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 現在の登録氏名の表示 */}
          {currentUser && currentUser.user_metadata.fullName && (
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                現在の登録氏名: {currentUser.user_metadata.fullName}
              </p>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Enter your first name"
                {...register("firstName", { required: true })}
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Enter your last name"
                {...register("lastName", { required: true })}
              />
            </div>
            <p className="text-sm text-gray-500">
              ※この名前は試薬登録時の署名として利用されます。
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSubmit(onSubmit)} className="w-full">
            更新
          </Button>
        </CardFooter>
      </Card>
      {message && <p className="text-green-500 text-center">{message}</p>}
      {error && <p className="text-red-500 text-center">{error}</p>}
    </div>
  );
}
