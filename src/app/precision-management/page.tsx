'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Department, MissingRecord } from '@/types/precision-management';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

// 検索パラメータを使用するコンポーネントを分離
function PrecisionManagementContent() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingRecords, setMissingRecords] = useState<MissingRecord[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { toast } = useToast();
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    // 無限ループ回避: 既にリダイレクト処理を行った場合は再実行しない
    if (redirected) return;

    // クエリパラメータでdepartmentIdが渡された場合のみリダイレクトする
    // 現在のパスが直接 /precision-management の場合のみ処理
    const departmentId = searchParams?.get('departmentId');
    if (departmentId && pathname === '/precision-management') {
      console.log('部署IDが検出されたため、詳細ページにリダイレクトします:', departmentId);
      setRedirected(true);
      router.push(`/precision-management/${departmentId}`);
      return;
    }

    async function fetchData() {
      try {
        // 部署データの取得
        const deptResponse = await fetch('/api/precision-management/departments');
        
        if (!deptResponse.ok) {
          throw new Error(`部署データの取得に失敗しました: ${deptResponse.status}`);
        }
        
        const deptData = await deptResponse.json();
        
        if (Array.isArray(deptData)) {
          setDepartments(deptData);
        } else {
          console.error('部署データが配列ではありません:', deptData);
          setDepartments([]);
          toast({
            title: 'エラー',
            description: '部署データの形式が正しくありません',
            variant: 'destructive',
          });
        }

        // 未入力記録の通知を取得
        const notificationsResponse = await fetch('/api/precision-management/notifications');
        
        if (!notificationsResponse.ok) {
          throw new Error(`通知データの取得に失敗しました: ${notificationsResponse.status}`);
        }
        
        const notificationsData = await notificationsResponse.json();
        setMissingRecords(notificationsData.missing_records || []);
      } catch (error) {
        console.error('データ取得エラー:', error);
        toast({
          title: 'データ取得エラー',
          description: error instanceof Error ? error.message : '不明なエラーが発生しました',
          variant: 'destructive',
        });
        setDepartments([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [toast, router, searchParams, pathname, redirected]);

  const navigateToDepartment = (departmentId: string) => {
    router.push(`/precision-management/${departmentId}`);
  };

  // 部署ごとの未入力記録数を計算
  const getMissingCountByDepartment = (departmentId: string) => {
    return missingRecords.filter(record => record.department_id === departmentId).length;
  };

  // 部署IDから部署を検索する安全な関数
  const findDepartmentById = (deptId: string) => {
    if (!Array.isArray(departments)) return null;
    return departments.find(d => d.id === deptId) || null;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">精度管理記録システム</h1>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {missingRecords.length > 0 && (
            <Card className="mb-8 bg-amber-50 border-amber-200">
              <CardHeader>
                <CardTitle className="text-amber-800">未入力の精度管理記録があります</CardTitle>
                <CardDescription className="text-amber-700">
                  以下の部署に未入力の記録があります。早めに入力してください。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-6 space-y-2">
                  {Array.from(new Set(missingRecords.map(record => record.department_id))).map(deptId => {
                    const dept = findDepartmentById(deptId as string);
                    const count = getMissingCountByDepartment(deptId as string);
                    return (
                      <li key={deptId as string} className="text-amber-800">
                        {dept?.name ?? '不明な部署'}: {count}件の未入力
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {Array.isArray(departments) && departments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {departments.map((department) => (
                <Card 
                  key={department.id} 
                  className={getMissingCountByDepartment(department.id) > 0 ? 'border-amber-300' : ''}
                >
                  <CardHeader>
                    <CardTitle>{department.name}</CardTitle>
                    <CardDescription>
                      {getMissingCountByDepartment(department.id) > 0 
                        ? `${getMissingCountByDepartment(department.id)}件の未入力があります` 
                        : '全ての記録が入力済みです'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={() => navigateToDepartment(department.id)}
                      className="w-full"
                      variant={getMissingCountByDepartment(department.id) > 0 ? 'default' : 'outline'}
                    >
                      記録を管理
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>部署データが見つかりません</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">部署データの取得に失敗したか、部署が登録されていません。</p>
                <Button onClick={() => window.location.reload()} variant="outline">
                  再読み込み
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// メインコンポーネントはSuspenseを使用して非同期操作を処理
export default function PrecisionManagementPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">精度管理記録システム</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>}>
      <PrecisionManagementContent />
    </Suspense>
  );
}