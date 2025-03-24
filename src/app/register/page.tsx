"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Register() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');
  
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [invitation, setInvitation] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
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
        const response = await fetch(`/api/invitations/verify?token=${token}`);
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
          setError(data.error || '無効な招待トークンです。');
          setValidating(false);
          setLoading(false);
          return;
        }
        
        setInvitation(data.invitation);
        setValidating(false);
        setLoading(false);
      } catch (error) {
        console.error('トークン検証エラー:', error);
        setError('招待トークンの検証中にエラーが発生しました。');
        setValidating(false);
        setLoading(false);
      }
    }
    
    validateToken();
  }, [token]);
  
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
    if (password.length < 8) {
      setError('パスワードは8文字以上である必要があります。');
      return;
    }
    
    setError(null);
    setRegistering(true);
    
    try {
      const response = await fetch('/api/invitations/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          fullName
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'アカウント作成中にエラーが発生しました。');
      }
      
      setSuccess('アカウントが正常に作成されました。ログインしてアプリを利用できます。');
      
      // 3秒後にログインページにリダイレクト
      setTimeout(() => {
        router.push('/login');
      }, 3000);
      
    } catch (error: any) {
      setError(error.message);
    } finally {
      setRegistering(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <Card className="w-[400px] shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>招待の検証中...</CardTitle>
            <CardDescription>お待ちください...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  if (error && !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <Card className="w-[400px] shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>招待エラー</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Link href="/login" className="text-blue-600 hover:underline">
                ログインページに戻る
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <Card className="w-[400px] shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>アカウント作成完了</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <Alert>
              <AlertTitle>成功</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                ログインページに自動的にリダイレクトします...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <Card className="w-[450px] shadow-lg">
        <CardHeader className="text-center">
          <CardTitle>新規ユーザー登録</CardTitle>
          <CardDescription>
            {invitation?.email}さん、{invitation?.facility}へようこそ
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="fullName">氏名（任意）</Label>
              <Input
                id="fullName"
                placeholder="例: 山田 太郎"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                value={invitation?.email || ''}
                disabled
                className="bg-gray-100"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">ユーザーロール</Label>
              <Input
                id="role"
                value={getRoleName(invitation?.role) || ''}
                disabled
                className="bg-gray-100"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">
                パスワード <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="8文字以上"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                パスワード（確認） <span className="text-red-500">*</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="同じパスワードを入力"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            
            <p className="text-xs text-gray-500">
              <span className="text-red-500">*</span> は必須項目です
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/login">
              <Button variant="outline" type="button">
                キャンセル
              </Button>
            </Link>
            <Button type="submit" disabled={registering}>
              {registering ? '登録中...' : 'アカウント作成'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// ロール名を日本語に変換
function getRoleName(roleValue: string) {
  const roles: {[key: string]: string} = {
    'facility_admin': '施設管理者',
    'approver': '承認者',
    'regular_user': '一般ユーザー'
  };
  
  return roles[roleValue] || roleValue;
}
