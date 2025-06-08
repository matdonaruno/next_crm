// src/app/api/minutesaudio/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    /* 認証 */
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });

    /* form-data */
    const form = await request.formData();
    const audioFile = form.get('audio') as File | null;
    const rawName = (form.get('fileName') as string | null) ?? undefined;

    // ---------- additional validations ----------
    const MAX_SIZE_MB = 50;
    if (audioFile && audioFile.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `ファイルサイズが ${MAX_SIZE_MB}MB を超えています` },
        { status: 413 },
      );
    }

    // 許可する MIME
    const allowedMime = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
    if (audioFile && !allowedMime.includes(audioFile.type)) {
      return NextResponse.json(
        { error: `許可されていないファイルタイプ (${audioFile.type})` },
        { status: 415 },
      );
    }

    if (!audioFile)
      return NextResponse.json(
        { error: 'audio ファイルがありません' },
        { status: 400 },
      );

    if (rawName && (rawName.includes('..') || rawName.startsWith('/'))) {
      return NextResponse.json(
        { error: '不正なファイル名です' },
        { status: 400 },
      );
    }

    const fileName =
      rawName ||
      `${user.id}/${Date.now()}-${uuidv4()}.${audioFile.name.split('.').pop()}`;

    /* minutesaudio バケット有無を簡易チェック（型を any キャストで回避） */
    const { error: listErr } = await supabase.storage
      .from('minutesaudio')
      .list('', { limit: 1 });
    if ((listErr as any)?.statusCode === 404)
      return NextResponse.json(
        { error: 'minutesaudio バケットが存在しません' },
        { status: 400 },
      );

    /* アップロード */
    const { data, error: upErr } = await supabase.storage
      .from('minutesaudio')
      .upload(fileName, audioFile, {
        contentType: audioFile.type || 'audio/mpeg',
        cacheControl: '3600',
        upsert: false,
      });

    if (upErr)
      return NextResponse.json(
        { error: `アップロード失敗: ${upErr.message}` },
        { status: 500 },
      );

    return NextResponse.json({
      success: true,
      path: data.path,
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/minutesaudio/${data.path}`,
    });
  } catch (e: any) {
    console.error('[minutesaudio][upload] error:', e);
    return NextResponse.json(
      { error: e.message || 'アップロード中にエラー' },
      { status: 500 },
    );
  }
}
