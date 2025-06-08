// src/app/api/meeting-minutes/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';;

export async function POST(request: NextRequest) {
  try {
    /* Supabase（SSR） */
    const supabase = await createServerClient();

    /* 認証 */
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });

    /* ユーザーの facility_id */
    const { data: profile } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', user.id)
      .single();
    if (!profile?.facility_id)
      return NextResponse.json(
        { error: '施設情報が取得できません' },
        { status: 403 },
      );
    const facilityId = profile.facility_id;

    /* 受信ファイル */
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file)
      return NextResponse.json(
        { error: 'ファイルが見つかりません' },
        { status: 400 },
      );

    /* 一意ファイル名を生成 */
    const ext = file.name.split('.').pop();
    const fileName = `meeting_recordings/${facilityId}/${Date.now()}.${ext}`;

    /* アップロード */
    const { error } = await supabase.storage
      .from('minutesaudio')
      .upload(fileName, file, {
        contentType: file.type || 'audio/mpeg',
        cacheControl: '3600',
      });

    if (error) {
      const msg = error.message.includes('bucket')
        ? 'ストレージ設定が不足しています'
        : `アップロード失敗: ${error.message}`;
      const code = error.message.includes('security') ? 403 : 500;
      return NextResponse.json({ error: msg }, { status: code });
    }

    return NextResponse.json({
      success: true,
      path: fileName,
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/minutesaudio/${fileName}`,
    });
  } catch (e: any) {
    console.error('[meeting-minutes][upload] error:', e);
    return NextResponse.json(
      { error: e.message || 'アップロード中にエラー' },
      { status: 500 },
    );
  }
}
