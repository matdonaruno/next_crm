import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { PrecisionManagementRecord } from '@/types/precision-management';

// 特定のレコードを取得
export async function GET(
  request: NextRequest,
  { params }: { params: { recordId: string } }
) {
  try {
    const recordId = params.recordId;
    if (!recordId) {
      return NextResponse.json(
        { error: '記録IDが指定されていません' },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);

    const { data, error } = await (await supabase.from('precision_management_records'))
      .select(`
        *,
        departments:department_id (name),
        precision_management_equipments:pm_equipment_id (equipment_name),
        implementation_timings:timing_id (timing_name)
      `)
      .eq('record_id', recordId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const formattedData = {
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
      department_name: data.departments.department_name,
      equipment_name: data.precision_management_equipments.equipment_name,
      timing_name: data.implementation_timings.timing_name
    };

    return NextResponse.json(formattedData);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// レコードの更新
export async function PUT(
  request: NextRequest,
  { params }: { params: { recordId: string } }
) {
  try {
    const recordId = params.recordId;
    if (!recordId) {
      return NextResponse.json({ error: '記録IDが指定されていません' }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);

    const body = await request.json();
    const updateData: Partial<PrecisionManagementRecord> = {
      department_id: body.department_id,
      pm_equipment_id: body.pm_equipment_id,
      implementation_date: body.implementation_date,
      implementer: body.implementer,
      timing_id: body.timing_id,
      implementation_count: body.implementation_count,
      error_count: body.error_count,
      shift_trend: body.shift_trend,
      remarks: body.remarks,
    };

    const { data, error } = await (await supabase.from('precision_management_records'))
      .update(updateData)
      .eq('record_id', recordId)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(data[0]);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// レコードの削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { recordId: string } }
) {
  try {
    const recordId = params.recordId;
    if (!recordId) {
      return NextResponse.json({ error: '記録IDが指定されていません' }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);

    const { error } = await (await supabase.from('precision_management_records'))
      .delete()
      .eq('record_id', recordId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 