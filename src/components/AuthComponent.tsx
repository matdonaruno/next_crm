'use client';

import { useEffect, useState } from 'react';
import { useSession, useUser } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, User as UserIcon } from 'lucide-react';
// import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; // 変更前
import { createBrowserClient } from '@supabase/ssr'; // 変更後
import CuteLoadingIndicator from './common/CuteLoadingIndicator'; // 新しいインポート

export default function AuthComponent() {
  const session = useSession(); // 現在のセッション情報
  // const supabaseClient = useSupabaseClient(); // 変更前
  // SupabaseクライアントをcreateBrowserClientを使用して初期化
  const supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ); // 変更後
  const user = useUser(); // 現在のユーザー情報
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ユーザープロファイルの取得
  useEffect(() => {
    const getProfile = async () => {
      setLoading(true);
      try {
        if (user) {
          const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) {
            console.error('プロファイル取得エラー:', error);
          } else if (data) {
            setProfile(data);
          }
        }
      } catch (error) {
        console.error('プロファイル取得中にエラーが発生:', error);
      } finally {
        setLoading(false);
      }
    };

    getProfile();
  }, [user, supabaseClient]);

  // ログアウト処理
  const handleSignOut = async () => {
    try {
      await supabaseClient.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('サインアウトエラー:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        {/* Loader2 を CuteLoadingIndicator に置き換え */}
        <CuteLoadingIndicator message="認証情報を確認中..." />
        {/* <Loader2 className="h-6 w-6 animate-spin text-primary" /> */}
      </div>
    );
  }

  if (!session) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>ログインが必要です</CardTitle>
          <CardDescription>ログインしてサービスをご利用ください</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => router.push('/login')} className="w-full">
            ログインページへ
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>ユーザー情報</CardTitle>
        <CardDescription>現在ログイン中のユーザー情報</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-3">
          <UserIcon className="h-5 w-5 text-primary" />
          <div>
            <p className="font-medium">{profile?.fullname || user?.email || '不明なユーザー'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        {profile && (
          <div className="text-sm">
            <p>部署: {profile.department_id ? `ID: ${profile.department_id}` : '未設定'}</p>
            <p>権限: {profile.role || '未設定'}</p>
            <p>管理者: {profile.is_admin ? 'はい' : 'いいえ'}</p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          ログアウト
        </Button>
      </CardFooter>
    </Card>
  );
}

// この他、セッションプロバイダーを設定する必要があります。
// 以下のようにルートレイアウトに設定します：

/*
// src/app/layout.tsx の例
'use client';

import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());
  
  return (
    <html lang="ja">
      <body>
        <SessionContextProvider supabaseClient={supabaseClient}>
          {children}
        </SessionContextProvider>
      </body>
    </html>
  );
}
*/