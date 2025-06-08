'use client';

import CreateMeetingMinuteClient from './CreateMeetingMinuteClient';

// クライアントコンポーネントではMetadataを直接エクスポートできないので削除
// export const metadata: Metadata = {
//   title: '会議議事録作成 | CRM',
//   description: '新しい会議議事録を作成します',
// };

export default function CreateMeetingMinutePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 text-slate-800">新規会議議事録作成</h1>
        <CreateMeetingMinuteClient />
      </div>
    </div>
  );
} 