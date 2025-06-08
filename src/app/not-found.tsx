// src/app/not-found.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h1 className="text-4xl font-bold mb-4">404 – ページが見つかりません</h1>
      <p className="mb-8 text-gray-600">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Button asChild>
        <Link href="/">ホームに戻る</Link>
      </Button>
    </div>
  );
}