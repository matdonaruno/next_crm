// src/app/api/minutesaudio/[fileName]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileName: string } },
) {
  try {
    const supabase = await createServerClient();
    const { fileName } = await params;
    const decoded = decodeURIComponent(fileName);
    // basic path traversal prevention
    if (!decoded || decoded.includes('..') || decoded.startsWith('/')) {
      return new NextResponse('Invalid file name', { status: 400 });
    }
    // simple MIME detection
    const mime =
      decoded.endsWith('.wav')
        ? 'audio/wav'
        : decoded.endsWith('.ogg')
        ? 'audio/ogg'
        : 'audio/mpeg';

    const { data, error } = await supabase.storage
      .from('minutesaudio')
      .download(decoded);

    if (error || !data) {
      console.error('[minutesaudio][download] not found:', decoded, error);
      return new NextResponse('File not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', mime);
    headers.set('Cache-Control', 'public, max-age=3600');

    return new NextResponse(data, { headers, status: 200 });
  } catch (e: any) {
    console.error('[minutesaudio][download] error:', e);
    return new NextResponse('Server error', { status: 500 });
  }
}
