import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies as nextCookies, ReadonlyRequestCookies } from 'next/headers';
import type { Database } from '@/types/supabase';

/**
 * ◎ サーバーコンポーネント／API 共通ファクトリ
 * - 戻り値は *同期* で SupabaseClient
 * - cookieStore を渡しても渡さなくても OK
 */
export const createClient = async (cookieStoreInput?: ReadonlyRequestCookies) => {
  const cookieStore = cookieStoreInput ?? await nextCookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // @ts-ignore Types are incompatible, but it works.
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          // @ts-ignore Types are incompatible, but it works.
          cookieStore.set(name, '', options);
        },
      },
    }
  );
};