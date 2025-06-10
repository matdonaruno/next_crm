'use client';

import AdminRoute from '@/components/auth/AdminRoute';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <AdminRoute requiredRole="admin">
      <div className="min-h-screen bg-gray-50">
        {/* ヘッダー */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-lg font-semibold text-gray-900">管理画面</h1>
              <div className="flex-1"></div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/depart')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <Home className="h-4 w-4" />
                ホームに戻る
              </Button>
            </div>
          </div>
        </header>

        {/* メインコンテンツ */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </AdminRoute>
  );
}