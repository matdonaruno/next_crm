// src/app/api/precision-management/[recordId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { PrecisionManagementRecord } from '@/types/precision-management';

/* ───────────── GET: 単一レコード ───────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const { recordId } = await params;
  const rid = parseInt(recordId, 10);
  if (Number.isNaN(rid))
    return NextResponse.json({ error: '記録IDが不正です' }, { status: 400 });

  const supa = await createServerClient();
  const { data, error } = await supa
    .from('precision_management_records')
    .select(`
      *,
      departments:department_id (name),
      precision_management_equipments:pm_equipment_id (equipment_name),
      implementation_timings:timing_id (timing_name)
    `)
    .eq('record_id', rid)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({
    record_id: data.record_id,
    department_id: data.department_id,
    pm_equipment_id: data.pm_equipment_id,
    implementation_date: data.implementation_date,
    implementer: data.implementer,
    timing_id: data.timing_id,
    implementation_count: data.implementation_count,
    error_count: data.error_count,
    shift_trend: data.shift_trend,
    remarks: data.remarks,
    created_at: data.created_at,
    updated_at: data.updated_at,
    department_name: data.departments.name,
    equipment_name: data.precision_management_equipments.equipment_name,
    timing_name: data.implementation_timings.timing_name,
  });
}

/* ───────────── PUT: 更新 ───────────── */
export async function PUT(
  req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const { recordId } = await params;
  const rid = parseInt(recordId, 10);
  if (Number.isNaN(rid))
    return NextResponse.json({ error: '記録IDが不正です' }, { status: 400 });

  const updateData: Partial<PrecisionManagementRecord> = await req.json();
  // 不正キー排除
  if ('record_id' in updateData) {
    delete (updateData as any).record_id;
  }
  // 空オブジェクトチェック
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: '更新フィールドがありません' },
      { status: 400 },
    );
  }
  const supa = await createServerClient();

  const { data, error } = await supa
    .from('precision_management_records')
    .update(updateData)
    .eq('record_id', rid)
    .select();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length)
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  return NextResponse.json(data[0]);
}

/* ───────────── DELETE: 削除 ───────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const { recordId } = await params;
  const rid = parseInt(recordId, 10);
  if (Number.isNaN(rid))
    return NextResponse.json({ error: '記録IDが不正です' }, { status: 400 });

  const supa = await createServerClient();
  const { error } = await supa
    .from('precision_management_records')
    .delete()
    .eq('record_id', rid);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
