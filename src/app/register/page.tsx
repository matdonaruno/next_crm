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
      router.push("/reagent_dash");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full sm:w-[85%] md:w-[75%] lg:w-[60%] xl:w-[50%] min-w-[300px] max-w-[800px] mx-auto">
        <Card className="w-full shadow-lg border border-gray-200">
          <CardHeader>
            <CardTitle>アカウント作成</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error && <p className="text-red-500">{error}</p>}
              <div>
                <Label htmlFor="firstName">名</Label>
                <Input 
                  id="firstName" 
                  {...register("firstName", { required: true })} 
                  placeholder="名"
                  required 
                />
              </div>
              <div>
                <Label htmlFor="lastName">姓</Label>
                <Input 
                  id="lastName" 
                  {...register("lastName", { required: true })} 
                  placeholder="姓"
                  required 
                />
              </div>
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input 
                  id="email" 
                  type="email" 
                  {...register("email", { required: true })} 
                  placeholder="you@example.com"
                  required 
                />
              </div>
              <div>
                <Label htmlFor="password">パスワード</Label>
                <Input 
                  id="password" 
                  type="password" 
                  {...register("password", { required: true })} 
                  placeholder="••••••••"
                  required 
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full">登録</Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
