'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const AuthForm = () => {
  const router = useRouter();
  const { signIn, user, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");

  // ユーザーが既にログインしている場合はリダイレクト
  useEffect(() => {
    if (!loading && user) {
      router.push('/depart');
    }
  }, [user, loading, router]);

  const handleAuth = async () => {
    try {
      setError("");
      setAuthLoading(true);

      if (isSignUp) {
        // 新規登録の場合
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              // 初期プロファイル情報
              fullname: null,
              facility_id: null
            }
          }
        });
        
        if (error) {
          setError(error.message);
          return;
        }

        // 新規登録後、プロファイルテーブルにレコードを作成
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([
              { 
                id: authData.user.id,
                fullname: null,
                facility_id: null
              }
            ]);
          
          if (profileError) {
            setError(profileError.message);
            return;
          }
        }

        // 登録成功メッセージ
        alert("アカウントが作成されました。ログインしてください。");
        setIsSignUp(false);
      } else {
        // ログインの場合
        const { error } = await signIn(email, password);
        
        if (error) {
          setError(error.message);
          return;
        }

        // ログイン成功後、AuthContextのuseEffectでリダイレクトされる
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("認証中にエラーが発生しました");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // ローディング中はローディング表示
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
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
          {error && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button 
            onClick={handleAuth} 
            className="w-full"
            disabled={authLoading || !email || !password}
          >
            {authLoading ? "処理中..." : isSignUp ? "新規登録" : "ログイン"}
            {!authLoading && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
          <p className="text-sm text-center text-gray-600">
            {isSignUp ? "既にアカウントをお持ちですか？ " : "アカウントをお持ちでないですか？ "}
            <span
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
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
