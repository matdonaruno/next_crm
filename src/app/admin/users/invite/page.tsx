'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UserInvite from '@/components/UserInvite';

export default function InviteUserPage() {
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-bold mb-6">ユーザー招待</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>招待メールを送信</CardTitle>
          <CardDescription>
            新しいユーザーをシステムに招待するには、以下のフォームにメールアドレスを入力してください。
            招待メールが送信され、ユーザーは招待リンクから登録できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserInvite />
        </CardContent>
      </Card>
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">招待について</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>招待メールは7日間有効です</li>
          <li>招待メールが届かない場合は、迷惑メールフォルダを確認するようユーザーに伝えてください</li>
          <li>同じメールアドレスに複数回招待を送信すると、前回の招待は無効になります</li>
        </ul>
      </div>
    </div>
  );
} 