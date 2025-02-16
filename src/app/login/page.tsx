'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight } from 'lucide-react';

const AuthForm = () => {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleAuth = async () => {
    try {
      let result;
      if (isSignUp) {
        // 新規登録の場合
        result = await supabase.auth.signUp({ email, password });
      } else {
        // ログインの場合
        result = await supabase.auth.signInWithPassword({ email, password });
      }
      if (result.error) {
        alert(result.error.message);
        return;
      }
      
      // 認証に成功したらユーザー情報を取得
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        alert("ユーザー情報の取得に失敗しました");
        return;
      }
      // ユーザーの氏名 (fullName) が未登録の場合は通知する
      if (!userData.user.user_metadata.fullName) {
        alert("氏名が登録されていません。ユーザー設定ページから登録してください。");
      }
      
      // ホームへリダイレクト
      router.push('/');
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignUp ? "新規登録" : "ログイン"}</CardTitle>
          <CardDescription>
            {isSignUp ? "アカウントを作成してサービスを利用開始" : "既存のアカウントでログイン"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button onClick={handleAuth} className="w-full">
            {isSignUp ? "新規登録" : "ログイン"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-sm text-center text-gray-600">
            {isSignUp ? "既にアカウントをお持ちですか？ " : "アカウントをお持ちでないですか？ "}
            <span
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary cursor-pointer hover:underline"
            >
              {isSignUp ? "ログイン" : "新規登録"}
            </span>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthForm;
