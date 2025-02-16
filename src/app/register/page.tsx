"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRequireAuth } from "@/hooks/useRequireAuth";

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export default function RegisterPage() {
  useRequireAuth();
  const { register, handleSubmit, reset } = useForm<FormValues>();
  const router = useRouter();
  const [error, setError] = useState("");

  const onSubmit = async (data: FormValues) => {
    const { firstName, lastName, email, password } = data;
    const fullName = `${firstName} ${lastName}`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { fullName, firstName, lastName }
      }
    });
    if (error) {
      setError(error.message);
    } else {
      reset();
      router.push("/");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>アカウント作成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-red-500">{error}</p>}
          <div>
            <Label htmlFor="firstName">名</Label>
            <Input id="firstName" {...register("firstName", { required: true })} placeholder="名" />
          </div>
          <div>
            <Label htmlFor="lastName">姓</Label>
            <Input id="lastName" {...register("lastName", { required: true })} placeholder="姓" />
          </div>
          <div>
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" type="email" {...register("email", { required: true })} placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="password">パスワード</Label>
            <Input id="password" type="password" {...register("password", { required: true })} placeholder="••••••••" />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSubmit(onSubmit)} className="w-full">登録</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
