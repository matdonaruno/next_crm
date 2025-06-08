// src/app/taskpick/page.tsx
'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const TaskPickClient = dynamic(() => import('./TaskPickClient'), {
  loading: () => <LoadingSpinner message="ページを読み込み中..." fullScreen />,
  ssr: false, // クライアントサイドのみでレンダリング
});

export default function TaskPickPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="コンポーネントを読み込み中..." fullScreen />}>
      <TaskPickClient />
    </Suspense>
  );
}
