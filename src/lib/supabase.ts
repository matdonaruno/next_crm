// src/lib/supabase.ts
import { createServerClient } from '@/lib/supabase/server';
import { supabaseBrowser } from '@/lib/supabase/client';
// import type { Database } from '@/types/supabase'; // この行を削除またはコメントアウト

// ───────── Browser ─────────
export const createSupabaseBrowser = () =>
  supabaseBrowser();

// ───────── Server Components / RSC ─────────
export const createSupabaseServer = async () =>
  await createServerClient();
