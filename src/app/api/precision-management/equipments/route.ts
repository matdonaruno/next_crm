// src/app/api/precision-management/equipments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supa = await createServerClient();

  let q = supa
    .from('precision_management_equipments')
    .select('*')
    .eq('is_active', true)
    .order('equipment_name');

  const depParam = req.nextUrl.searchParams.get('department_id');
  if (depParam) {
    const departmentId = parseInt(depParam, 10);
    if (!Number.isNaN(departmentId)) {
      q = q.eq('department_id', departmentId as any);
    } else {
      return NextResponse.json(
        { error: 'Invalid department_id' },
        { status: 400 },
      );
    }
  }

  const { data, error } = await q;
  if (error)
    return NextResponse.json(
      { error: error.message, detail: error.details },
      { status: 500 },
    );
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  type EquipBody = {
    equipment_name: string;
    department_id: string;
    model_number?: string;
    serial_number?: string;
    installation_date?: string;
    maintenance_interval?: number;
    is_active?: boolean;
  };

  const {
    equipment_name,
    department_id,
    model_number,
    serial_number,
    installation_date,
    maintenance_interval,
    is_active = true,
  } = body as EquipBody;

  if (!equipment_name || !department_id) {
    return NextResponse.json(
      { error: 'equipment_name and department_id are required' },
      { status: 400 },
    );
  }

  const supa = await createServerClient();

  const { data, error } = await supa
    .from('precision_management_equipments')
    .insert({
      equipment_name,
      department_id,
      model_number,
      serial_number,
      installation_date,
      maintenance_interval,
      is_active,
    })
    .select();

  if (error)
    return NextResponse.json(
      { error: error.message, detail: error.details },
      { status: 500 },
    );
  return NextResponse.json(data);
}
