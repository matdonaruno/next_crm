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
  const [redirecting, setRedirecting] = useState(false);

  // ページロード時に既存のセッションをクリア
  useEffect(() => {
    const clearExistingSession = async () => {
      try {
        // ローカルセッションのみをクリア（ログインページに来た場合は新しいログインを想定）
        await supabase.auth.signOut({ scope: 'local' });
        console.log("LoginPage: ローカルセッションをクリアしました");
      } catch (e) {
        console.error("LoginPage: セッションクリア中にエラーが発生しました", e);
      }
    };
    
    clearExistingSession();
  }, []);

  // デバッグ用：状態変更を監視
  useEffect(() => {
    console.log("LoginPage: 状態変更", { 
      user: user?.id || 'なし', 
      loading, 
      authLoading, 
      error: error || 'なし',
      redirecting
    });
  }, [user, loading, authLoading, error, redirecting]);

  // ユーザーが既にログインしている場合はリダイレクト
  useEffect(() => {
    console.log("LoginPage: ユーザー状態チェック", { 
      loading, 
      user: user?.id || 'なし',
      redirecting
    });
    
    if (!loading && user && !redirecting) {
      console.log("LoginPage: ユーザーは既にログイン済み、リダイレクト準備中", user.id);
      setRedirecting(true);
      
      // リダイレクト前に少し遅延を入れる（認証状態が完全に確立されるのを待つ）
      setTimeout(() => {
        console.log("LoginPage: /departへリダイレクト実行", user.id);
        router.push('/depart');
      }, 500); // 遅延を短縮
    }
  }, [user, loading, router, redirecting]);

  const handleAuth = async () => {
    setError("");
    setAuthLoading(true);

    try {
      if (isSignUp) {
        // サインアップ処理
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setError(error.message);
        } else {
          // サインアップ成功
          setError("確認メールを送信しました。メールを確認してアカウントを有効化してください。");
        }
      } else {
        // サインイン処理
        console.log("LoginPage: サインイン処理開始", { email });
        setRedirecting(true); // サインイン開始時にリダイレクト状態にする
        
        const { error } = await signIn(email, password);

        if (error) {
          console.error("LoginPage: サインインエラー", error);
          setError(error.message);
          setRedirecting(false); // エラー時はリダイレクト状態を解除
        } else {
          console.log("LoginPage: サインイン成功、リダイレクト準備中");
          // 成功時はリダイレクト状態を維持
          // リダイレクトは上記のuseEffectで処理される
        }
      }
    } catch (error: any) {
      console.error("LoginPage: 認証処理中に例外発生", error);
      setError(error.message || "認証中にエラーが発生しました");
      setRedirecting(false); // 例外時はリダイレクト状態を解除
    } finally {
      setAuthLoading(false);
    }
  };

  // ローディング中はローディング表示
  if (loading) {
    console.log("LoginPage: グローバルローディング中...");
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
        <form onSubmit={(e) => {
          e.preventDefault();
          handleAuth();
        }}>
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
                  required
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
                  required
                />
              </div>
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            {/* デバッグ情報 */}
            <div className="p-3 bg-gray-50 border border-gray-300 rounded-md">
              <p className="text-xs text-gray-700 font-mono">
                <strong>デバッグ情報:</strong><br />
                ユーザー: {user ? user.id : 'なし'}<br />
                グローバルローディング: {loading ? 'はい' : 'いいえ'}<br />
                認証ローディング: {authLoading ? 'はい' : 'いいえ'}<br />
                エラー: {error || 'なし'}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit"
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
        </form>
      </Card>
    </div>
  );
};

export default AuthForm;
