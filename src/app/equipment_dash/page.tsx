'use client';

import { Suspense } from "react";
import dynamic from "next/dynamic";

// クライアントコンポーネントを動的インポート
const EquipmentDashboardClient = dynamic(() => import("./EquipmentDashboardClient"));

export default function EquipmentDashboardPage() {
  return (
    <Suspense fallback={
      <div className="w-full min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">機器メンテナンスダッシュボード</div>
          <div className="text-gray-600">読み込み中...</div>
        </div>
      </div>
    }>
      <EquipmentDashboardClient />
    </Suspense>
  );
} 