'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminRouteProps {
  children: React.ReactNode;
  requiredRole?: 'superuser' | 'facility_admin' | 'admin'; // admin = superuser | facility_admin
  fallbackPath?: string;
}

export default function AdminRoute({ 
  children, 
  requiredRole = 'admin',
  fallbackPath = '/' 
}: AdminRouteProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);

  useEffect(() => {
    // まだ認証情報をロード中の場合は待機
    if (loading) {
      setIsAuthorized(null);
      setAuthCheckCompleted(false);
      return;
    }

    // 認証が完了したが、ユーザーまたはプロファイルがない場合
    // 少し待ってから再チェック（AuthContextの状態更新を待つ）
    if (!user || !profile) {
      const retryTimer = setTimeout(() => {
        // 再チェックのトリガー
        setAuthCheckCompleted(false);
      }, 500);
      
      return () => clearTimeout(retryTimer);
    }

    // 権限チェック実行
    console.log('[AdminRoute] 権限チェック開始');
    const userRole = profile.role;
    let authorized = false;

    switch (requiredRole) {
      case 'superuser':
        authorized = userRole === 'superuser';
        break;
      case 'facility_admin':
        authorized = userRole === 'facility_admin' || userRole === 'superuser';
        break;
      case 'admin':
        authorized = userRole === 'superuser' || userRole === 'facility_admin';
        break;
      default:
        authorized = false;
    }

    console.log('[AdminRoute] 権限チェック結果:', {
      userRole,
      requiredRole,
      authorized
    });

    setIsAuthorized(authorized);
    setAuthCheckCompleted(true);

    // 権限がない場合は3秒後にリダイレクト
    if (!authorized) {
      const timer = setTimeout(() => {
        console.log('[AdminRoute] 権限不足によりホームページにリダイレクト');
        router.replace(fallbackPath);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [user, profile, loading, requiredRole, fallbackPath, router]);

  // ローディング中または権限チェック未完了
  if (loading || !authCheckCompleted || isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-purple-50 flex items-center justify-center">
        <Card className="w-96 border-pink-200 bg-white shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
              <p className="text-gray-600">
                {loading ? '認証情報を確認中...' : '権限を確認中...'}
              </p>
              <p className="text-xs text-gray-400">
                状態: {loading ? 'ロード中' : authCheckCompleted ? '完了' : '処理中'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 権限がない場合
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-purple-50 flex items-center justify-center">
        <Card className="w-96 border-red-200 bg-white shadow-lg">
          <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
            <CardTitle className="flex items-center text-red-800">
              <AlertTriangle className="h-5 w-5 mr-2" />
              アクセス拒否
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Shield className="h-16 w-16 mx-auto text-red-400" />
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">管理者権限が必要です</h3>
                <p className="text-sm text-gray-600 mb-4">
                  このページにアクセスするには{' '}
                  {requiredRole === 'superuser' ? 'スーパーユーザー' : 
                   requiredRole === 'facility_admin' ? '施設管理者' : '管理者'} 権限が必要です。
                </p>
                <p className="text-xs text-gray-500">
                  現在のロール: {profile?.role || '未設定'}
                </p>
              </div>
              <div className="space-y-2">
                <Button 
                  onClick={() => router.replace(fallbackPath)}
                  className="w-full bg-gradient-to-r from-pink-400 to-purple-500 text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  ホームに戻る
                </Button>
                <p className="text-xs text-gray-400">3秒後に自動的にリダイレクトします</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 権限がある場合は子コンポーネントを表示
  return <>{children}</>;
}