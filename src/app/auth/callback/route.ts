// src/app/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

const _envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const _envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!_envUrl || !_envKey) {
  throw new Error('Missing Supabase environment variables');
}
const SUPABASE_URL: string = _envUrl;
const SUPABASE_ANON_KEY: string = _envKey;

export async function GET(request: NextRequest) {
  // Next.js の cookies() から RequestCookies を取得
  const cookieStore = await cookies();

  // Cookie domain and security settings
  const url = new URL(request.url);
  const cookieDomain = url.hostname;
  const isSecure = url.protocol === 'https:';

  // Supabase SSR クライアントを生成
  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        // クッキーをすべて取得
        getAll() {
          return cookieStore.getAll().map(c => ({
            name: c.name,
            value: c.value,
            options: {},
          }))
        },
        // 複数のクッキーをまとめて設定
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
      cookieOptions: {
        name: process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME ?? 'sb-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: isSecure,
        ...(cookieDomain !== 'localhost' && { domain: cookieDomain }),
      },
      cookieEncoding: 'raw',
    }
  )

  // OAuth コールバックの code を受け取りセッション交換
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Failed to exchange auth code:', error.message);
      const errorUrl = new URL('/auth/signin', request.url);
      errorUrl.searchParams.set('error', 'exchange_failed');
      return NextResponse.redirect(errorUrl);
    }
  }

  // 認証後はトップへリダイレクト
  return NextResponse.redirect(new URL('/', request.url))
}
