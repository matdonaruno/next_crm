// src/app/equipment_dash/page.tsx
'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const EquipmentDashboardClient = dynamic(
  () => import('@/app/equipment_dash/EquipmentDashboardClient'),
  { loading: () => <LoadingSpinner message="機器ダッシュボードを読み込み中..." fullScreen /> }
);

export default function EquipmentDashboardPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="コンポーネントを読み込み中..." fullScreen />}>
      <EquipmentDashboardClient />
    </Suspense>
  );
}
