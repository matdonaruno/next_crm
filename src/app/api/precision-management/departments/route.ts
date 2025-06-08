// src/app/api/precision-management/departments/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerClient();

    /* ─ 任意: テーブル一覧 RPC (失敗しても無視) ─ */
    try {
      const { data: tables } = await supabase.rpc('get_tables', {});
      console.info('[departments] tables:', tables);
    } catch (e) {
      console.info('[departments] get_tables RPC unavailable');
    }

    /* ─ departments 取得 ─ */
    const { data, error } = await supabase
      .from('departments')
      .select('id,name')
      .order('name', { ascending: true });

    if (error) {
      console.error('[departments] DB error:', error);
      return NextResponse.json(
        { error: 'データベースエラー', detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[departments] unexpected:', e);
    return NextResponse.json(
      { error: 'サーバー内部エラー', detail: e.message },
      { status: 500 },
    );
  }
}
