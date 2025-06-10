// src/app/api/meeting-minutes/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { Json } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

import * as fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import https from 'https';
import FormData from 'form-data';

// --- force Node.js runtime (Edge 30 s 制限回避) ----------------------------
export const runtime = 'nodejs';

// 型: fs.ReadStream に name プロパティを付与
interface ReadStreamWithName extends fs.ReadStream {
  name: string;
}

// 一時ファイルクリーンアップ用ユーティリティ
const cleanupTempFile = async (filePath?: string) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      await fs.promises.unlink(filePath);
      console.log('[transcribe] 一時ファイル削除完了', { filePath });
    } catch (e) {
      console.warn('[transcribe] 一時ファイル削除失敗', { filePath, e });
    }
  }
};

// OpenAI クライアントの初期化（音声ファイル用に設定最適化）
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000, // 2分のタイムアウト（音声ファイル用）
  maxRetries: 3,   // リトライ回数を増加
});

export async function POST(req: NextRequest) {
  console.log('[transcribe] === 文字起こしAPI開始 ===');

  // --- この関数全体で使い回す一時ファイルパス ------------------------
  // early‑return ブランチでも参照されるので最初に宣言しておく
  let tempFilePath: string | undefined;
  
  /* 1) Bearer ヘッダー必須 */
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    console.error('[transcribe] Authorization header missing');
    await cleanupTempFile(tempFilePath);
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const token = auth.replace('Bearer ', '');
  console.log('[transcribe] Token received, length:', token.length);

  /* 2) API キー存在チェック（早期リターン） */
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[transcribe] API キー確認', {
    exists: !!apiKey,
    length: apiKey?.length || 0,
    prefix: apiKey?.substring(0, 7) || 'none'
  });
  
  if (!apiKey) {
    console.error('[transcribe] OPENAI_API_KEY missing');
    await cleanupTempFile(tempFilePath);
    return NextResponse.json(
      { error: 'OPENAI_API_KEY が未設定です' },
      { status: 500 },
    );
  }

  /* 3) Supabaseクライアントを作成してトークンで認証 */
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
  
  // トークンを使ってユーザー情報を取得
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('[transcribe] 認証エラー', { authError, hasUser: !!user });
    return NextResponse.json({ error: '認証セッション無し' }, { status: 401 });
  }
  
  console.log('[transcribe] 認証成功', { userId: user.id });

  /* 4) リクエスト解析（multipart / JSON の両対応） */
  let meetingMinuteId: string | undefined;
  let audioFile: ReadStreamWithName | File;
  let fileName = 'audio.mp3';
  let mimeType = 'audio/mpeg';

  const ctype = req.headers.get('Content-Type') || '';
  if (ctype.includes('multipart/form-data')) {
    const form = await req.formData();
    const f = form.get('file');
    if (!(f instanceof File))
      return NextResponse.json({ error: 'file が必要' }, { status: 400 });
    audioFile = f;
  } else {
    const body = await req.json();
    console.log('[transcribe] JSON body parsed:', body);
    meetingMinuteId = body.meetingMinuteId;
    const audioPath = body.audioPath;
    if (!meetingMinuteId || !audioPath)
      return NextResponse.json(
        { error: 'meetingMinuteId と audioPath が必要' },
        { status: 400 },
      );

    /* ステータス: processing */
    await supabase
      .from('meeting_minutes')
      .update({ processing_status: 'processing' })
      .eq('id', meetingMinuteId);

    /* Storage から取得 */
    console.log('[transcribe] audioPath before download:', audioPath);
    const { data: bin, error } = await supabase.storage
      .from('minutesaudio')
      .download(audioPath);
    console.log('[transcribe] download result:', { bin, error });
    if (error || !bin) {
      await supabase
        .from('meeting_minutes')
        .update({ processing_status: 'error' })
        .eq('id', meetingMinuteId);

      await cleanupTempFile(tempFilePath);
      return NextResponse.json(
        { error: '音声取得失敗' },
        { status: 500 },
      );
    }
    
    let fileExtension: string | undefined;
    fileExtension = audioPath.split('.').pop()?.toLowerCase();
    if (fileExtension === 'webm') {
      mimeType = 'audio/webm';
      fileName = 'audio.webm';
    } else if (fileExtension === 'mp3') {
      mimeType = 'audio/mpeg';
      fileName = 'audio.mp3';
    }
    
    console.log('[transcribe] ファイル情報', { audioPath, fileExtension, mimeType, fileName, fileSize: bin.size });
    
    // ROOT CAUSE FIX: File APIがNode.js環境で接続エラーを起こすため、
    // 一時ファイルとfs.createReadStreamを使用する
    console.log('[transcribe] 一時ファイル作成方式に変更');
    
    // 一時ディレクトリに音声ファイルを保存
    const tempDir = os.tmpdir();
    tempFilePath = path.join(
      tempDir,
      `whisper_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`,
    );
    
    try {
      // BlobをBufferに変換
      const buffer = Buffer.from(await bin.arrayBuffer());
      console.log('[transcribe] Blob→Buffer変換完了', {
        originalSize: bin.size,
        bufferSize: buffer.length,
        bufferType: buffer.constructor.name
      });
      
      console.log('[transcribe] 一時ファイル書き込み開始', { tempFilePath });
      // バイナリデータを一時ファイルに書き込み
      await fs.promises.writeFile(tempFilePath, buffer);
      console.log('[transcribe] 一時ファイル書き込み完了', { tempFilePath });
      
      // ファイルストリームを作成（これがOpenAI SDKで動作する）
      audioFile = fs.createReadStream(tempFilePath) as ReadStreamWithName;
      audioFile.name = fileName;
      
    } catch (fsError: any) {
      console.error('[transcribe] 一時ファイル作成失敗', fsError);
      throw new Error(`一時ファイル作成に失敗: ${fsError.message}`);
    }
    
    // ファイル形式の検証
    const supportedFormats = ['mp3', 'mp4', 'm4a', 'wav', 'webm'];
    if (!supportedFormats.includes(fileExtension || '')) {
      console.warn('[transcribe] サポートされていないファイル形式', fileExtension);
      return NextResponse.json(
        { error: `サポートされていないファイル形式: ${fileExtension}` },
        { status: 400 }
      );
    }
    
    // ファイルサイズの警告（25MB制限）
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (bin.size > maxSize) {
      console.warn('[transcribe] ファイルサイズが制限を超過', { 
        fileSize: bin.size, 
        maxSize,
        sizeMB: (bin.size / 1024 / 1024).toFixed(2)
      });
      return NextResponse.json(
        { error: `ファイルサイズが大きすぎます (${(bin.size / 1024 / 1024).toFixed(2)}MB > 25MB)` },
        { status: 400 }
      );
    }
    
    // 大きめのファイルへの警告
    if (bin.size > 10 * 1024 * 1024) { // 10MB以上
      console.warn('[transcribe] 大きなファイルです、処理に時間がかかる可能性があります', {
        sizeMB: (bin.size / 1024 / 1024).toFixed(2)
      });
    }
  }

  // 初期化
  let transcription = '';

  // ---------------- 非同期ジョブ化 ----------------
  //   音声アップロード〜Whisper 文字起こしは時間がかかるので、
  //   クライアントへは 202 Accepted を返してすぐに一覧へ遷移させる。
  //
  const immediateRes = NextResponse.json({ queued: true }, { status: 202 });

  // 重い処理は待たずにバックグラウンドで実行
  (async () => {
    /* 4.5) OpenAI接続テスト */
    console.log('[transcribe] OpenAI接続テスト開始');
    try {
      // シンプルなAPI呼び出しでOpenAI接続を確認
      await openai.models.list();
      console.log('[transcribe] OpenAI接続テスト成功');
    } catch (connectionError: any) {
      console.error('[transcribe] OpenAI接続テスト失敗', {
        errorType: connectionError.constructor.name,
        message: connectionError.message,
        status: connectionError.status,
        code: connectionError.code
      });
      // レスポンスは返さない
      return;
    }

    /* 5) Whisper 文字起こし（rate-limit 対応） */
    try {
      // 一時ファイルパスを保存（クリーンアップ用）
      if (audioFile && typeof (audioFile as any).path === 'string') {
        tempFilePath = (audioFile as any).path;
      } else {
        throw new Error('audioFile のパスが取得できません');
      }

      console.log('[transcribe] Whisper API呼び出し開始', {
        fileName: (audioFile as any).name,
        tempFilePath,
        openaiApiKeyExists: !!process.env.OPENAI_API_KEY,
        openaiApiKeyLength: process.env.OPENAI_API_KEY?.length || 0
      });

      // 手動リトライ付きWhisper API呼び出し
      const maxAttempts = 3;
      let lastError: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`[transcribe] 試行 ${attempt}/${maxAttempts}: Whisper API呼び出し開始`);

          // 少し待ってから再試行（2回目以降）
          if (attempt > 1) {
            const waitTime = attempt * 2000; // 2秒、4秒と段階的に増加
            console.log(`[transcribe] ${waitTime}ms 待機中...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }

          // OpenAI SDK で接続エラーが発生するため、直接HTTP APIを使用
          console.log(`[transcribe] 試行 ${attempt}: 直接HTTP API呼び出しに変更`);

          const formData = new FormData();
          formData.append('file', fs.createReadStream(tempFilePath!), {
            filename: fileName,
            contentType: mimeType,
          });
          formData.append('model', 'whisper-1');
          formData.append('language', 'ja');
          formData.append('response_format', 'text');

          console.log(`[transcribe] FormData作成完了`, {
            fileName,
            mimeType,
            tempFilePath
          });

          const axiosConfig = {
            httpsAgent: new https.Agent({ keepAlive: false, timeout: 120000 }),
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              ...formData.getHeaders(),
            },
            maxBodyLength: Infinity, // 25 MB 以上でも転送可
            timeout: 180000,         // 3 min
            responseType: 'text',
          };
          const axiosRes = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            axiosConfig,
          );

          console.log('[transcribe] axios response status:', axiosRes.status);
          console.log('[transcribe] axios response data snippet:', typeof axiosRes.data === 'string' ? axiosRes.data.substring(0, 100) : '');

          transcription = axiosRes.data as string;
          console.log(`[transcribe] HTTP API 成功`, {
            transcriptionLength: transcription.length,
          });

          console.log(`[transcribe] 試行 ${attempt} 成功！文字起こし完了`);
          break; // 成功したらループを抜ける

        } catch (error: any) {
          lastError = error;
          console.warn(`[transcribe] 試行 ${attempt} 失敗:`, {
            errorType: error.constructor?.name,
            message: error.message,
            code: error.code,
            isConnectionError: error.code === 'ECONNRESET' || error.message?.includes?.('Connection error')
          });

          // 最後の試行でも失敗した場合
          if (attempt === maxAttempts) {
            console.error(`[transcribe] 全 ${maxAttempts} 回の試行が失敗`);
            throw lastError;
          }

          // 接続エラー以外は即座に諦める
          if (!error.message?.includes?.('Connection error') && error.code !== 'ECONNRESET') {
            console.error('[transcribe] 致命的エラーのため即座に停止');
            throw error;
          }
        }
      }

      console.log('[transcribe] Whisper API呼び出し成功', {
        transcriptionLength: transcription?.length || 0,
        transcriptionPreview: transcription?.substring(0, 100)
      });

      /* 6) 文字起こし結果の後処理とDB保存（JSON リクエストのみ） */
      if (meetingMinuteId) {
        console.log('[transcribe] 文字起こし後処理開始');
        
        // GPTで句読点付与と話者分離を行う
        let processedTranscription = transcription;
        try {
          const improveRes = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0.3,
            max_tokens: 4000,
            messages: [
              {
                role: 'system',
                content: `あなたは会議の文字起こし結果を整形する専門家です。以下の指示に従って文字起こし結果を改善してください：

【必須タスク】
1. 適切な位置に句読点（、。）を追加
2. 話者が変わると思われる箇所で必ず改行
3. 各発言の冒頭に話者ラベルを付与（話者1:、話者2:、話者3: など）
4. 話し言葉を自然な文章に整理（「えー」「あのー」などの不要な言葉は削除）

【話者識別のヒント】
- 質問と回答のパターンで話者を区別
- 敬語の使用有無で立場を推測
- 専門用語の使用頻度で役割を推測
- 会議の文脈から司会者、発表者、参加者を識別

【フォーマット例】
話者1: 本日の会議を開始します。議題は〇〇についてです。
話者2: はい、私から説明させていただきます。
話者1: お願いします。
話者2: まず最初に...

元の内容や意味は一切変更せず、読みやすさと話者識別の精度を向上させてください。`,
              },
              { role: 'user', content: transcription },
            ],
          });
          
          processedTranscription = improveRes.choices[0].message.content || transcription;
          console.log('[transcribe] 文字起こし後処理完了');
        } catch (improveError) {
          console.warn('[transcribe] 文字起こし後処理失敗、元の結果を使用:', improveError);
        }

        // セグメント分割を改善（数字付き話者ラベルに対応）
        const segments = processedTranscription
          .split(/\n(?=話者\d+[:：])/g)
          .filter(Boolean)
          .map((text, i) => {
            const trimmedText = text.trim();
            // 話者1:、話者2: などの形式に対応
            const speakerMatch = trimmedText.match(/^話者(\d+)[:：]/);
            const speakerNumber = speakerMatch ? speakerMatch[1] : String((i % 3) + 1);
            const speakerId = `speaker_${speakerNumber}`;
            const cleanText = speakerMatch ? trimmedText.replace(/^話者\d+[:：]\s*/, '') : trimmedText;
            
            // 話者ごとに役割を推定（将来的に拡張可能）
            let speakerRole = '参加者';
            if (cleanText.includes('開始します') || cleanText.includes('次の議題')) {
              speakerRole = '司会者';
            } else if (cleanText.includes('説明します') || cleanText.includes('報告します')) {
              speakerRole = '発表者';
            }
            
            return {
              id: `seg-${Date.now()}-${i}`,
              text: cleanText,
              speakerId,
              speakerRole,
              timestamp: i * 30 // 仮の30秒間隔
            };
          });
        console.log('[transcribe] segments length before DB update:', segments.length);

        const { error: updateError } = await supabase
          .from('meeting_minutes')
          .update({
            is_transcribed: true,
            processing_status: 'done',
            segments: segments as Json,
          })
          .eq('id', meetingMinuteId);

        if (updateError) {
          console.error('[transcribe] データベース更新エラー', updateError);
          // エラーステータスに更新
          await supabase
            .from('meeting_minutes')
            .update({ processing_status: 'error' })
            .eq('id', meetingMinuteId);
        } else {
          // 文字起こし完了後に要約を実行
          console.log('[transcribe] 要約処理を開始');
          try {
            const summarizeUrl =
              `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}` +
              '/api/meeting-minutes/summarize';

            console.log('[transcribe] 要約API呼び出し詳細', {
              url: summarizeUrl,
              hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE,
              serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE?.length,
              meetingMinuteId
            });

            const summaryResponse = await fetch(summarizeUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // summarize エンドポイントはサービスロール鍵で認証
                Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
              },
              body: JSON.stringify({ meetingMinuteId }),
            });

            if (!summaryResponse.ok) {
              console.error('[transcribe] 要約API呼び出しエラー', await summaryResponse.text());
            } else {
              console.log('[transcribe] 要約完了');
            }
          } catch (summaryError) {
            console.error('[transcribe] 要約処理エラー', summaryError);
            // 要約エラーでも文字起こしは成功しているので、processing_statusは'done'のまま
          }
        }
      }
    } catch (err: any) {
      console.error('[transcribe] Whisper API エラー詳細', {
        errorType: err.constructor?.name,
        errorMessage: err.message,
        errorStatus: err.status,
        errorCode: err.code,
        errorStack: err.stack,
        isAPIError: err instanceof OpenAI.APIError,
        fullError: err
      });
      console.error('[transcribe] キャッチされたエラー:', err.stack);

      /* エラー時は processing_status を 'error' に更新 */
      if (meetingMinuteId) {
        await supabase
          .from('meeting_minutes')
          .update({ processing_status: 'error' })
          .eq('id', meetingMinuteId);
      }
      // レスポンスは返さない
    } finally {
      console.log('[transcribe] 一時ファイルクリーンアップ開始', { tempFilePath });
      // 一時ファイルのクリーンアップ
      await cleanupTempFile(tempFilePath);
    }
  })();

  return immediateRes;
  // -------------------------------------------------
}
