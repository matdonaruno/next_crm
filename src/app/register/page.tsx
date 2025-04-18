"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
// createClientのインポートを削除し、共通のsupabaseクライアントをインポート
import supabase from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, ArrowRight, Cross, Sparkles, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// SearchParamsを取得するラッパーコンポーネント
function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // URLからトークンを取得し、フラグメント識別子を削除
  const rawToken = searchParams?.get('token');
  // より強固なトークン処理 - クエリパラメータと#以降を適切に処理
  const token = rawToken ? rawToken.split('#')[0].split('?')[0].trim() : null;
  
  console.log('現在のセッション状態:', { 
    rawToken, 
    cleanedToken: token, 
    fullUrl: typeof window !== 'undefined' ? window.location.href : null,
    hasHash: typeof window !== 'undefined' && !!window.location.hash
  });
  
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [invitation, setInvitation] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  // フルネームを取得
  const getFullName = () => {
    return `${lastName} ${firstName}`.trim();
  };
  
  // URLフラグメントを削除する処理
  useEffect(() => {
    // URLにフラグメントが含まれている場合、クリーンなURLに置き換える
    if (typeof window !== 'undefined' && window.location.hash && window.location.search.includes('token=')) {
      const cleanUrl = window.location.pathname + window.location.search.split('#')[0];
      // 履歴を書き換えずにURLを更新
      window.history.replaceState({}, '', cleanUrl);
      console.log('URLからフラグメントを削除しました:', cleanUrl);
    }
  }, []);
  
  // トークンの検証
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('招待トークンが必要です。管理者に確認してください。');
        setValidating(false);
        setLoading(false);
        return;
      }
      
      try {
        console.log('トークン検証APIを呼び出し:', token, '長さ:', token.length);
        const response = await fetch(`/api/invitations/verify?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        
        console.log('トークン検証結果:', data);
        
        if (!response.ok || !data.valid) {
          const errorMsg = data.error || '無効な招待トークンです。';
          setError(`${errorMsg} トークン検証APIからの詳細: ${JSON.stringify(data)}`);
          setValidating(false);
          setLoading(false);
          return;
        }
        
        setInvitation(data.invitation);
        setEmail(data.invitation.email || '');
        setValidating(false);
        setLoading(false);
      } catch (error) {
        console.error('トークン検証エラー:', error);
        setError(`招待トークンの検証中にエラーが発生しました。詳細: ${error instanceof Error ? error.message : String(error)}`);
        setValidating(false);
        setLoading(false);
      }
    }
    
    validateToken();
  }, [token]);
  
  // パスワードの強度を検証する関数
  const validatePassword = (password: string) => {
    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    return {
      isValid: hasLowerCase && hasUpperCase && hasNumber && password.length >= 8,
      hasLowerCase,
      hasUpperCase,
      hasNumber,
      hasMinLength: password.length >= 8
    };
  };
  
  // ユーザー登録の処理
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 入力検証
    if (!password || !confirmPassword) {
      setError('パスワードは必須です。');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('パスワードが一致しません。');
      return;
    }
    
    // パスワードの強度検証
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
      let errorMsg = 'パスワードは以下の条件を満たす必要があります：';
      if (!passwordCheck.hasMinLength) errorMsg += '\n- 8文字以上';
      if (!passwordCheck.hasLowerCase) errorMsg += '\n- 小文字(a-z)を含む';
      if (!passwordCheck.hasUpperCase) errorMsg += '\n- 大文字(A-Z)を含む';
      if (!passwordCheck.hasNumber) errorMsg += '\n- 数字(0-9)を含む';
      
      setError(errorMsg);
      return;
    }
    
    // 姓名の検証
    if (!lastName && !firstName) {
      setError('姓または名を入力してください。');
      return;
    }
    
    setError(null);
    setRegistering(true);
    
    try {
      console.log('アカウント登録APIを呼び出し:', {
        hasToken: !!token,
        tokenLength: token?.length,
        hasPassword: !!password,
        hasFullName: !!getFullName()
      });
      
      const response = await fetch('/api/invitations/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          fullName: getFullName(),
        }),
      });
      
      const data = await response.json();
      console.log('登録API応答:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'アカウント作成中にエラーが発生しました。');
      }
      
      setSuccess(data.message || 'アカウントが正常に作成されました。ログインしてアプリを利用できます。');
      
      // 3秒後にログインページにリダイレクト
      setTimeout(() => {
        router.push('/login');
      }, 3000);
      
    } catch (error: any) {
      console.error('登録エラーの詳細:', error);
      setError(error.message);
    } finally {
      setRegistering(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-100 to-slate-200">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <p className="text-slate-600 font-medium">招待を確認中...</p>
        </motion.div>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-100 to-slate-200">
        <Card className="w-full max-w-md border-0 shadow-lg bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-500 to-stone-600 bg-clip-text text-transparent">
              アカウント作成完了
            </CardTitle>
            <CardDescription className="text-gray-500">
              ログインページに自動的にリダイレクトします...
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="rounded-full bg-stone-100 p-3 inline-block mb-4">
                <svg
                  className="h-8 w-8 text-stone-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </motion.div>
            <p className="text-gray-600">{success}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-100 to-slate-200">
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="h-12 w-12 text-stone-300 opacity-70" />
            </motion.div>
          </div>

          <CardHeader className="space-y-1 pb-2">
            <div className="flex items-center space-x-2">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Cross className="h-6 w-6 text-slate-500" />
              </motion.div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-500 to-stone-600 bg-clip-text text-transparent">
                サインアップ
              </CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              {invitation ? `${invitation.email}で新規アカウントを作成` : '招待からアカウントを作成'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleRegister}>
            <CardContent className="space-y-5 pt-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-50 border border-red-200 rounded-xl"
                >
                  <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                </motion.div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 font-medium">
                  メールアドレス
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="pl-10 border-stone-200 focus:border-slate-400 focus:ring-slate-300 rounded-xl bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-gray-700 font-medium">
                  姓
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="山田"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="pl-10 border-stone-200 focus:border-slate-400 focus:ring-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-gray-700 font-medium">
                  名
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="太郎"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-10 border-stone-200 focus:border-slate-400 focus:ring-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700 font-medium">
                  パスワード
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 border-stone-200 focus:border-slate-400 focus:ring-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div className="text-xs space-y-1 text-gray-500">
                  <p>パスワードは以下の条件を満たす必要があります：</p>
                  <ul className="list-disc pl-5">
                    <li className={password.length >= 8 ? "text-green-600" : ""}>8文字以上</li>
                    <li className={/[a-z]/.test(password) ? "text-green-600" : ""}>小文字(a-z)を含む</li>
                    <li className={/[A-Z]/.test(password) ? "text-green-600" : ""}>大文字(A-Z)を含む</li>
                    <li className={/[0-9]/.test(password) ? "text-green-600" : ""}>数字(0-9)を含む</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-700 font-medium">
                  パスワード（確認用）
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 border-stone-200 focus:border-slate-400 focus:ring-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-2">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-slate-500 to-stone-600 hover:from-slate-600 hover:to-stone-700 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
                  disabled={registering || !password || !confirmPassword || (!lastName && !firstName)}
                >
                  {registering ? "処理中..." : "アカウント作成"}
                  {!registering && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>
              </motion.div>

              <p className="text-sm text-center text-gray-600">
                既にアカウントをお持ちですか？ 
                <motion.span
                  whileHover={{ color: "#52525b" }} // zinc-600
                  onClick={() => router.push('/login')}
                  className="text-stone-500 font-medium cursor-pointer transition-colors duration-300 ml-1"
                >
                  ログイン
                </motion.span>
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

// メインコンポーネント - Suspenseで囲む
export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-100 to-slate-200">
        <p className="text-slate-600 font-medium">読み込み中...</p>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
