'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Cross, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';

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
        // Supabase URLからプロジェクトIDを抽出
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'bsgvaomswzkywbiubtjg';
        const storageKey = `sb-${projectId}-auth-token`;
        
        // ローカルセッションのみをクリア（ログインページに来た場合は新しいログインを想定）
        await supabase.auth.signOut({ scope: 'local' });
        console.log("LoginPage: ローカルセッションをクリアしました");
        
        // クッキーを明示的に削除
        Cookies.remove(storageKey, { path: '/' });
        console.log("LoginPage: クッキーを削除しました");
        
        // ローカルストレージも削除
        if (localStorage.getItem(storageKey)) {
          localStorage.removeItem(storageKey);
          console.log("LoginPage: ローカルストレージを削除しました");
        }
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

  // リダイレクト状態が変わった時に強制的にリダイレクトを実行
  useEffect(() => {
    if (redirecting && user) {
      console.log("LoginPage: リダイレクト状態が変更されました。強制的にリダイレクトを実行します", user.id);
      
      // router.pushが機能しない場合に備えて、window.locationも使用
      setTimeout(() => {
        try {
          console.log("LoginPage: 強制リダイレクト実行", user.id);
          window.location.href = '/depart';
        } catch (e) {
          console.error("LoginPage: リダイレクト中にエラーが発生しました", e);
        }
      }, 1000);
    }
  }, [redirecting, user]);

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
          // ただし、明示的にリダイレクトも実行
          setTimeout(() => {
            console.log("LoginPage: サインイン成功後、明示的にリダイレクト実行");
            window.location.href = '/depart';
          }, 1000);
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-100 to-purple-100">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <p className="text-purple-600 font-medium">読み込み中...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-100 to-purple-100">
      {/* 背景の装飾パーティクル */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: Math.random() * 0.5 + 0.3,
              y: [0, Math.random() * -20, 0],
            }}
            transition={{ 
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2 
            }}
            className="absolute rounded-full bg-white"
            style={{
              width: `${Math.random() * 20 + 5}px`,
              height: `${Math.random() * 20 + 5}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              boxShadow: "0 0 10px rgba(255, 255, 255, 0.8)",
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={isSignUp ? "signup" : "login"}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden">
            <div className="absolute top-0 right-0 -mt-6 -mr-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles className="h-12 w-12 text-purple-300 opacity-70" />
              </motion.div>
            </div>

            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-center space-x-2">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Cross className="h-6 w-6 text-pink-400" />
                </motion.div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
                  {isSignUp ? "新規登録" : "ログイン"}
                </CardTitle>
              </div>
              <CardDescription className="text-gray-500">
                {isSignUp ? "アカウントを作成してサービスを利用開始" : "既存のアカウントでログイン"}
              </CardDescription>
            </CardHeader>

            <form onSubmit={(e) => {
              e.preventDefault();
              handleAuth();
            }}>
              <CardContent className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-700 font-medium">
                    メールアドレス
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-pink-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 border-pink-200 focus:border-purple-400 focus:ring-purple-300 rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-700 font-medium">
                    パスワード
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-pink-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 border-pink-200 focus:border-purple-400 focus:ring-purple-300 rounded-xl"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-700">{error}</p>
                  </motion.div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col space-y-4 pt-2">
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button 
                    type="submit"
                    className="w-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white font-medium py-2 rounded-xl transition-all duration-300"
                    disabled={authLoading || !email || !password}
                  >
                    {authLoading ? "処理中..." : isSignUp ? "新規登録" : "ログイン"}
                    {!authLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </motion.div>

                <p className="text-sm text-center text-gray-600">
                  {isSignUp ? "既にアカウントをお持ちですか？ " : "アカウントをお持ちでないですか？ "}
                  <motion.span
                    whileHover={{ color: "#ec4899" }} // pink-500
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError("");
                    }}
                    className="text-purple-500 font-medium cursor-pointer transition-colors duration-300"
                  >
                    {isSignUp ? "ログイン" : "新規登録"}
                  </motion.span>
                </p>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default AuthForm;
