import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

/**
 * ブラウザ専用 Supabase クライアント
 * - React Hooks（@supabase/auth-helpers-react など）と組み合わせて使用
 * - 1 度だけ生成し、アプリ全体で共有する
 */
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// 型補完用エクスポート（任意）
export type { Database };

// 従来どおり default でも使えるようにしておく
export default supabase;
