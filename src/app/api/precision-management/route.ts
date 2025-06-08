// src/app/api/precision-management/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type {
  PrecisionManagementRecord,
  PrecisionManagementRecordWithDetails,
} from '@/types/precision-management';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const supa = await createServerClient();

  /* ────────────── 基本クエリ ────────────── */
  let q = supa
    .from('precision_management_records')
    .select('*')
    .order('implementation_date', { ascending: false });

  /* string | null → string へ絞り込み & number へ変換 */
  const deptId = sp.get('department_id');
  if (deptId) q = q.eq('department_id', deptId);

  const equipIdStr = sp.get('equipment_id');
  if (equipIdStr) {
    const equipId = parseInt(equipIdStr, 10);
    if (!Number.isNaN(equipId)) {
      q = q.eq('pm_equipment_id', equipId as any);
    }
  }

  const start = sp.get('start_date');
  if (start) q = q.gte('implementation_date', start);

  const end = sp.get('end_date');
  if (end) q = q.lte('implementation_date', end);

  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json([]);

  /* ────────────── 関連マスタを一括取得 ────────────── */
  const [departments, equipments, timings] = await Promise.all([
    supa
      .from('departments')
      .select('id,name')
      .in('id', [...new Set(data.map(r => r.department_id))] as string[]),
    supa
      .from('precision_management_equipments')
      .select('pm_equipment_id,equipment_name')
      .in(
        'pm_equipment_id',
        [...new Set(data.map(r => r.pm_equipment_id))] as number[],
      ),
    supa
      .from('implementation_timings')
      .select('timing_id,timing_name')
      .in('timing_id', [...new Set(data.map(r => r.timing_id))] as number[]),
  ]);

  const deptMap = Object.fromEntries(departments.data?.map(d => [d.id, d.name]) || []);
  const equipMap = Object.fromEntries(equipments.data?.map(e => [e.pm_equipment_id, e.equipment_name]) || []);
  const timingMap = Object.fromEntries(timings.data?.map(t => [t.timing_id, t.timing_name]) || []);

  /* ────────────── 整形（created_at / updated_at は undef 可） ────────────── */
  const formatted: PrecisionManagementRecordWithDetails[] = data.map(r => ({
    ...r,
    implementation_time: r.implementation_time || '00:00',
    created_at: r.created_at ?? undefined,
    updated_at: r.updated_at ?? undefined,
    department_name: deptMap[r.department_id] || '不明な部署',
    equipment_name: equipMap[r.pm_equipment_id] || '不明な機器',
    timing_name: timingMap[r.timing_id] || '不明なタイミング',
  }));

  return NextResponse.json(formatted);
}

/* 15 分丸めユーティリティ */
const roundTo15 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const rm = Math.round(m / 15) * 15;
  return `${String(rm === 60 ? h + 1 : h).padStart(2, '0')}:${String(
    rm === 60 ? 0 : rm,
  ).padStart(2, '0')}`;
};

export async function POST(req: NextRequest) {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const rounded = roundTo15(
    body.implementation_time ||
      body.implementation_date.split('T')[1]?.slice(0, 5) ||
      '00:00',
  );

  const newRec: Omit<
    PrecisionManagementRecord,
    'record_id' | 'created_at' | 'updated_at'
  > = {
    department_id: body.department_id,
    pm_equipment_id: body.pm_equipment_id,
    implementation_date: body.implementation_date.split('T')[0],
    implementation_time: rounded,
    implementer: body.implementer,
    timing_id: body.timing_id,
    implementation_count: body.implementation_count,
    error_count: body.error_count,
    shift_trend: body.shift_trend,
    remarks: body.remarks,
  };

  const { data, error } = await supa
    .from('precision_management_records')
    .insert(newRec)
    .select();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data[0], { status: 201 });
}
