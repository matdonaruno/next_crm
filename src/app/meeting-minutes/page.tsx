'use client';

import { Suspense } from 'react';
import MeetingMinutesClient from './MeetingMinutesClient';

// ローディング表示用のプレースホルダー
function MeetingMinutesLoading() {
  return (
    <div className="flex flex-col min-h-screen h-full bg-gradient-to-br from-pink-50 to-purple-50 overflow-hidden relative">
      <div className="w-full h-14 bg-white shadow-sm flex items-center px-4">
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
      </div>
      <div className="w-full max-w-7xl mx-auto px-4 pt-6">
        <div className="h-10 w-full max-w-md mx-auto bg-white/80 rounded-full animate-pulse mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-4 shadow-sm">
              <div className="h-6 w-3/4 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse mb-3"></div>
              <div className="h-10 w-full bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MeetingMinutesPage() {
  return (
    <Suspense fallback={<MeetingMinutesLoading />}>
      <MeetingMinutesClient />
    </Suspense>
  );
} 