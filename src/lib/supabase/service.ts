// src/lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * サービスロールクライアント（RLSをバイパス）
 * APIルートやサーバーサイドの処理で使用
 */
export const createServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })
}