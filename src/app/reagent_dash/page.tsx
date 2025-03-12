'use client';

import { Suspense } from "react";
import dynamic from "next/dynamic";

// クライアントコンポーネントを動的インポート
const ReagentDashboardClient = dynamic(() => import("./ReagentDashboardClient"));

export default function ReagentDashboardPage() {
  return (
    <Suspense fallback={<div className="w-full min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-bold mb-4">試薬ダッシュボード</div>
        <div className="text-gray-600">読み込み中...</div>
      </div>
    </div>}>
      <ReagentDashboardClient />
    </Suspense>
  );
}
