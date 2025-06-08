import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getJstTimestamp } from '@/lib/utils';

export async function POST(req: NextRequest) {
  console.log('Barcode route called');

  try {
    const { barcode } = (await req.json()) as { barcode?: string };

    if (!barcode || typeof barcode !== 'string' || barcode.trim().length === 0) {
      return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
    }
    const clean = barcode.trim().slice(0, 128); // max 128 chars

    const supabase = await createServerClient();
    const { error: insertErr } = await supabase
      .from('barcode_scans' as any) // table may be missing in generated types
      .insert([
        {
          barcode: clean,
          scanned_at: getJstTimestamp(),
        },
      ] as any);

    if (insertErr) {
      console.error('[barcode] insert error:', insertErr);
      return NextResponse.json(
        { error: 'Failed to log barcode scan' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, barcode: clean });
  } catch (error) {
    console.error('Barcode scan error:', error);
    return NextResponse.json({ error: 'Failed to process barcode' }, { status: 500 });
  }
}
