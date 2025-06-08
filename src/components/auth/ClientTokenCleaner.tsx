'use client';

import { SessionMonitor } from './SessionMonitor';
import { TokenMigrator } from './TokenMigrator';

/**
 * 認証・セッション管理の親コンポーネント
 * - 各機能を分割して責務を明確化
 * - コード量を削減しメンテナンス性向上
 */
export function ClientTokenCleaner() {
  return (
    <>
      {/* セッションに基づくリダイレクト処理 */}
      <SessionMonitor />
      
      {/* トークン形式移行と整合性チェック */}
      <TokenMigrator />
    </>
  );
} 