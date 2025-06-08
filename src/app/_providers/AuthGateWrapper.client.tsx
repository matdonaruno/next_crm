// src/app/_providers/AuthGateWrapper.client.tsx
'use client';

import { PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AuthGate from '@/components/AuthGate.client';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

/* ------------------ 認証ルール定義 ------------------- */
const PUBLIC_PATHS = ['/', '/login', '/direct-login', '/register'];
const NO_DEPARTMENT_PATHS = ['/depart', '/meeting-minutes/create'];

/**
 * 末尾スラッシュを除去した正規化パスを返す（"/" ルートはそのまま）。
 * 例: "/depart/" → "/depart"
 */
const normalizePath = (path: string) =>
  path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;

/* ------------------ 判定ヘルパ ---------------------- */
const matchByPrefix = (pathname: string, list: string[]) =>
  list.some((prefix) => pathname.startsWith(prefix));

/* ----------------- ラッパー本体 --------------------- */
export default function AuthGateWrapper({ children }: PropsWithChildren) {
  const pathname = usePathname() ?? '';
  const [basePath] = pathname.split(/[?#]/);
  const normalizedPath = normalizePath(basePath);

  const { loading } = useAuth();
  if (loading) {
    return <LoadingSpinner message="認証情報を確認中..." fullScreen />;
  }

  // 1) 公開ページはそのまま描画
  if (
    matchByPrefix(normalizedPath, PUBLIC_PATHS) ||
    normalizedPath.startsWith('/api')
  ) {
    return <>{children}</>;
  }

  // 2) 所属不要（ログインのみ必須）
  if (matchByPrefix(normalizedPath, NO_DEPARTMENT_PATHS)) {
    return (
      <AuthGate requireLogin requireDepartment={false}>
        {children}
      </AuthGate>
    );
  }

  // 3) デフォルト: ログイン + 所属必須
  return (
    <AuthGate requireLogin requireDepartment>
      {children}
    </AuthGate>
  );
}