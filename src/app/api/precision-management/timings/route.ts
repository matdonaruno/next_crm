// src/app/api/precision-management/timings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supa = await createServerClient();
  const { data, error } = await supa
    .from('implementation_timings')
    .select('timing_id,timing_name')
    .order('timing_name');

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  type TimingBody = { timing_name?: string };
  const { timing_name } = body as TimingBody;

  if (!timing_name || timing_name.trim().length === 0) {
    return NextResponse.json(
      { error: 'timing_name is required' },
      { status: 400 },
    );
  }

  const supa = await createServerClient();

  const { data, error } = await supa
    .from('implementation_timings')
    .insert({ timing_name: timing_name.trim() })
    .select();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
