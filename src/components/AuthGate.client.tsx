// src/app/meeting-minutes/AuthGate.client.tsx
'use client';

import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

/**
 * 子コンポーネントをラップして、
 * - 読み込み中はスピナー
 * - 未ログインなら案内＆「ログイン画面へ」ボタン
 * - facility_id がないなら案内＆「所属選択へ」ボタン
 * を表示し、条件を満たせば children を描画します。
 */
export default function AuthGate(
  props: PropsWithChildren<{
    requireLogin?: boolean;
    requireDepartment?: boolean;
  }>
) {
  const router = useRouter();
  const { user, session, loading, profile } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  // 認証チェックは副作用内で一度だけ
  useEffect(() => {
    if (loading) return;

    if (props.requireLogin !== false && session === null) {
      setRedirecting(true);
      router.replace('/login');
    } else if (
      props.requireDepartment !== false &&
      session?.user &&
      profile &&
      !profile.facility_id
    ) {
      setRedirecting(true);
      router.replace('/depart');
    }
  }, [loading, session, profile, props.requireLogin, props.requireDepartment, router, user]);

  if (loading) {
    return <LoadingSpinner message="認証情報を確認中..." fullScreen />;
  }
  if (redirecting) {
    return <LoadingSpinner message="リダイレクト中..." fullScreen />;
  }

  // 問題なければ中身を描画
  return <>{props.children}</>;
}