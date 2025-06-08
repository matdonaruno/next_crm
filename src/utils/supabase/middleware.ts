// utils/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextFetchEvent } from 'next/server'
import { NextResponse } from 'next/server'

export async function updateSession(
  req: NextRequest,
  ev: NextFetchEvent
) {
  // レスポンスオブジェクトを生成
  const res = NextResponse.next()
  // SSR クライアント生成（req + res を渡すと自動で Cookie を扱ってくれる）
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          res.cookies.set(name, value, options)
        },
        remove(name: string, options: any) {
          res.cookies.set(name, '', { ...options, maxAge: 0 })
        },
      }
    }
  )
  // セッションを更新（内部でリフレッシュ→Set-Cookie まで実施）
  await supabase.auth.getSession()
  return res
}