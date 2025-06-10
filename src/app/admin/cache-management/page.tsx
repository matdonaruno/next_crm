// src/app/admin/cache-management/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearFacilityCache } from '@/lib/facilityCache';
import { clearUserProfileCache } from '@/lib/userCache';
import AdminRoute from '@/components/auth/AdminRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, CheckCircle2, ArrowLeft, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CacheManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [clearingFacility, setClearingFacility] = useState(false);
  const [clearingUser, setClearingUser] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // 施設キャッシュをクリア
  const handleClearFacilityCache = async () => {
    setClearingFacility(true);
    try {
      await clearFacilityCache();
      toast({
        title: '施設キャッシュをクリアしました',
        description: '次回のページ読み込み時に最新の施設情報が取得されます',
        variant: 'default',
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'エラー',
        description: `施設キャッシュのクリアに失敗しました: ${err.message ?? 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setClearingFacility(false);
    }
  };

  // ユーザープロファイルキャッシュをクリア
  const handleClearUserCache = async () => {
    setClearingUser(true);
    try {
      await clearUserProfileCache();
      toast({
        title: 'ユーザーキャッシュをクリアしました',
        description: '次回のページ読み込み時に最新のユーザー情報が取得されます',
        variant: 'default',
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'エラー',
        description: `ユーザーキャッシュのクリアに失敗しました: ${err.message ?? 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setClearingUser(false);
    }
  };

  // すべてのキャッシュをクリア
  const handleClearAllCache = async () => {
    setClearingAll(true);
    try {
      await Promise.all([
        clearFacilityCache(),
        clearUserProfileCache(),
      ]);
      // その他のローカルキャッシュキーがあればここに追加
      localStorage.removeItem('facilityCache');

      toast({
        title: 'すべてのキャッシュをクリアしました',
        description: '次回のページ読み込み時に最新の情報が取得されます',
        variant: 'default',
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'エラー',
        description: `キャッシュのクリアに失敗しました: ${err.message ?? 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setClearingAll(false);
    }
  };

  // ページをリロード
  const handleReloadPage = () => {
    router.refresh(); // Next.js App Router でのクライアントリフレッシュ
  };

  return (
    <AdminRoute requiredRole="superuser">
      <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center">
        <Button 
          variant="ghost" 
          onClick={() => router.back()} 
          className="mr-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>
        <h1 className="text-3xl font-bold">キャッシュ管理</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 施設キャッシュカード */}
        <Card>
          <CardHeader>
            <CardTitle>施設キャッシュ</CardTitle>
            <CardDescription>
              現在の施設情報のキャッシュを管理します
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              温度管理や部署管理などでの施設情報の表示に問題がある場合は、
              施設キャッシュをクリアしてください。
            </p>
            
            <div className="flex items-center text-sm text-yellow-600 mb-2">
              <AlertCircle className="h-4 w-4 mr-2" />
              <span>キャッシュクリア後はページの再読み込みが必要です</span>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClearFacilityCache}
              disabled={clearingFacility}
            >
              {clearingFacility ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  クリア中...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  キャッシュクリア
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* ユーザーキャッシュカード */}
        <Card>
          <CardHeader>
            <CardTitle>ユーザーキャッシュ</CardTitle>
            <CardDescription>
              ユーザープロファイル情報のキャッシュを管理します
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              ユーザー名や権限の表示に問題がある場合は、
              ユーザーキャッシュをクリアしてください。
            </p>
            
            <div className="flex items-center text-sm text-yellow-600 mb-2">
              <AlertCircle className="h-4 w-4 mr-2" />
              <span>キャッシュクリア後はページの再読み込みが必要です</span>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClearUserCache}
              disabled={clearingUser}
            >
              {clearingUser ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  クリア中...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  キャッシュクリア
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* すべてのキャッシュカード */}
        <Card>
          <CardHeader>
            <CardTitle>すべてのキャッシュ</CardTitle>
            <CardDescription>
              アプリケーションの全キャッシュを管理します
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              さまざまな情報の表示や動作に問題がある場合は、
              すべてのキャッシュをクリアしてください。
            </p>
            
            <div className="flex items-center text-sm text-yellow-600 mb-2">
              <AlertCircle className="h-4 w-4 mr-2" />
              <span>キャッシュクリア後はページの再読み込みが必要です</span>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={handleReloadPage}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              ページ再読み込み
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAllCache}
              disabled={clearingAll}
            >
              {clearingAll ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  クリア中...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  すべてクリア
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-start">
          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-green-900">キャッシュ管理について</h3>
            <p className="text-sm text-green-700 mt-1">
              キャッシュをクリアすると、次回のページ読み込み時に最新のデータがデータベースから取得されます。
              施設名やユーザー情報が正しく表示されない場合は、関連するキャッシュをクリアしてから
              ページを再読み込みしてください。
            </p>
          </div>
        </div>
      </div>
    </div>
    </AdminRoute>
  );
}