'use client';

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

// クライアントコンポーネントを動的インポート
const ReagentDashboardClient = dynamic(() => import("./ReagentDashboardClient"), {
  loading: () => <LoadingSpinner message="試薬ダッシュボードを読み込み中..." fullScreen />
});

export default function ReagentDashboardPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="コンポーネントを読み込み中..." fullScreen />}>
      <ReagentDashboardClient />
    </Suspense>
  );
}