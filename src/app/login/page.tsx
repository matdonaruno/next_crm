'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Cross, Sparkles } from 'lucide-react';
import supabaseClient from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const AuthForm = () => {
  const router = useRouter();
  const supabase = supabaseClient;
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailPlaceholder, setEmailPlaceholder] = useState("you@example.com");
  const [passwordPlaceholder, setPasswordPlaceholder] = useState("••••••••");

  // すでに認証済みの場合は部門選択画面にリダイレクト
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        console.log("LoginPage: 既存セッション検出、リダイレクト準備中");
        router.replace('/depart');
        return;
      }
      setCheckingSession(false);
    };
    
    checkSession();
  }, [router, supabase.auth]);

  // セッションチェック中はローディング表示のみ
  if (checkingSession) {
    return <LoadingSpinner message="認証状態を確認中..." fullScreen />;
  }

  const handleAuth = async () => {
    setError("");
    setAuthLoading(true);

    try {
      // サインイン処理
      console.log("LoginPage: サインイン処理開始", { email });
      
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        throw authError;
      }

      console.log("LoginPage: サインイン成功、リダイレクト準備中");
      // 成功時にリダイレクト
      router.push('/depart');
    } catch (err: any) {
      console.error("LoginPage: 認証処理中に例外発生", err);
      setError(err.message || "認証中にエラーが発生しました");
    } finally {
      setAuthLoading(false);
    }
  };

  // ログインページメインコンポーネント
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
          key="login"
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

            <CardHeader className="flex flex-col items-center text-center space-y-1 pb-2">
              <div className="flex items-center space-x-2">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Cross className="h-6 w-6 text-pink-400" />
                </motion.div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
                  ログイン
                </CardTitle>
              </div>
              <CardDescription className="text-gray-500">
                アカウント情報でログイン
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
                      placeholder={emailPlaceholder}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailPlaceholder("")}
                      onBlur={() => !email && setEmailPlaceholder("you@example.com")}
                      className="pl-10 border-pink-200 focus:border-purple-400 focus:ring-purple-300 rounded-xl"
                      autoComplete="email"
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
                      type={showPassword ? "text" : "password"}
                      placeholder={passwordPlaceholder}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPasswordPlaceholder("")}
                      onBlur={() => !password && setPasswordPlaceholder("••••••••")}
                      className="pl-10 border-pink-200 focus:border-purple-400 focus:ring-purple-300 rounded-xl"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />
                      }
                    </button>
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
                    className="w-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-300 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
                    disabled={authLoading || !email || !password}
                  >
                    {authLoading ? "処理中..." : "ログイン"}
                    {!authLoading && <ArrowRight className="ml-2 h-5 w-5" />}
                  </Button>
                </motion.div>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default function LoginPage() {
  return <AuthForm />;
}
