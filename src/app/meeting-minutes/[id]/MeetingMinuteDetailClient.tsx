// src/app/meeting-minutes/[id]/MeetingMinuteDetailClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import MeetingMinuteHeader from './components/MeetingMinuteHeader';
import AudioPlayer from './components/AudioPlayer';
import TranscriptViewer, { TranscriptSegment } from './components/TranscriptViewer';
// SpeakerDialog と Speaker は現在使用されていないため削除
// import SpeakerDialog, { Speaker } from './components/SpeakerDialog';
import { Download, FileAudio, Trash2, Edit2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MeetingMinuteRow } from '@/types/meeting-minutes';

// API からのレスポンス型（権限情報付き）
type MeetingMinuteWithPermissions = MeetingMinuteRow & {
  canDelete?: boolean;
  meeting_types?: { name: string } | null;
  profiles?: { fullname: string } | null;
};
import { stripBucketName } from '@/utils/audio';
import { createBrowserClient } from '@supabase/ssr'; // createServerClient と CookieOptions を削除し、createBrowserClient をインポート
import CuteLoadingIndicator from '@/components/common/CuteLoadingIndicator'; // 新しいインポート
// cookies のインポートを削除

// Speaker 型をここで定義するか、別ファイルからインポート（もし他でも使う場合）
interface Speaker {
  id: string;
  name: string;
  color: string;
}

export default function MeetingMinuteDetailClient({
  meetingMinuteId,
}: {
  meetingMinuteId: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createBrowserClient( // createBrowserClient を使用して初期化
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [meetingMinute, setMeetingMinute] = useState<MeetingMinuteWithPermissions | null>(null);
  // Remove unused state since speakers are only used for mapping segments
  const [, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  // isSpeakerDialogOpen は SpeakerDialog を使わないので削除
  // const [isSpeakerDialogOpen, setIsSpeakerDialogOpen] = useState(false);
  const [cleanAudioPath, setCleanAudioPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  /* ================================================================
     議事録取得
     ================================================================ */
  console.log('Detail page ID:', meetingMinuteId); // デバッグ用

  useEffect(() => {
    const abortController = new AbortController();
    let isCancelled = false;

    const fetchMeetingMinute = async () => {
      setIsLoading(true);
      try {
        /* 1) 本人確認 */
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) throw new Error('認証が必要です');
        if (isCancelled) return;

        /* 2) API 呼び出し（cookieベース認証） */
        const res = await fetch(`/api/meeting-minutes/${meetingMinuteId}`, {
          signal: abortController.signal,
        });

        if (isCancelled) return;

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? '議事録の取得に失敗しました');
        }

        const data: MeetingMinuteWithPermissions = await res.json();
        if (isCancelled) return;

        setMeetingMinute(data);
        if (data.audio_file_path) {
          setCleanAudioPath(stripBucketName(data.audio_file_path));
        }

        // data.speakers が string の場合 JSON.parse する
        let spk: Speaker[] = [];
        if (typeof data.speakers === 'string') {
          try {
            spk = JSON.parse(data.speakers) as Speaker[];
          } catch (parseError) {
            console.error('Failed to parse speakers JSON:', parseError);
            spk = [];
          }
        } else if (Array.isArray(data.speakers)) {
          try {
            spk = (data.speakers as any[]).map((s) => ({
              id: (s as any).id,
              name: (s as any).name,
              color: (s as any).color,
            }));
          } catch {
            spk = [];
          }
        } else {
          spk = [];
        }

        // data.segments が string の場合 JSON.parse する
        let rawSegs: any[] = [];
        if (typeof data.segments === 'string') {
          try {
            rawSegs = JSON.parse(data.segments) as any[];
          } catch (parseError) {
            console.error('Failed to parse segments JSON:', parseError);
            rawSegs = [];
          }
        } else if (Array.isArray(data.segments)) {
          rawSegs = data.segments as any[];
        } else {
          rawSegs = [];
        }

        const segs: TranscriptSegment[] = rawSegs.map((s: any, index: number): TranscriptSegment => {
          const speakerId = (s as any).speakerId ?? (s as any).speaker_id;
          const speakerRole = (s as any).speakerRole ?? '参加者';
          const speakerInfo = spk.find(x => x.id === speakerId);
          
          // 話者番号から色を生成（一貫性のある色）
          const speakerNumber = speakerId?.replace('speaker_', '') || String((index % 5) + 1);
          const colorMap: Record<string, string> = {
            '1': '#3b82f6', // Blue
            '2': '#10b981', // Green  
            '3': '#f59e0b', // Orange
            '4': '#8b5cf6', // Purple
            '5': '#ef4444', // Red
          };
          const defaultColor = colorMap[speakerNumber] || '#6b7280';
          
          return {
            id: (s as any).id ?? crypto.randomUUID(),
            speaker: speakerInfo?.name ?? `${speakerRole}${speakerNumber}`,
            color: speakerInfo?.color ?? defaultColor,
            text: (s as any).text ?? '',
            speakerId,
            timestamp: (s as any).timestamp,
          };
        });

        setSpeakers(spk);
        setSegments(segs);

      } catch (e: any) {
        if (e.name !== 'AbortError' && !isCancelled) {
          console.error('Failed to fetch meeting minute:', e);
          toast({
            title: 'エラー',
            description: e.message ?? '議事録の取得に失敗しました',
            variant: 'destructive',
          });
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchMeetingMinute();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [meetingMinuteId, supabase, toast]);

  // ファイルをダウンロードする関数
  const handleDownloadFile = () => {
    if (cleanAudioPath) {
      window.open(`/api/meeting-minutes/audio/${encodeURIComponent(cleanAudioPath)}`, '_blank');
    }
  };

  // 削除処理
  const handleDelete = async () => {
    if (!meetingMinute) return;
    
    setIsDeleting(true);
    
    try {
      const res = await fetch(`/api/meeting-minutes/${meetingMinuteId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || '削除に失敗しました');
      }

      toast({
        title: '削除完了',
        description: '議事録を削除しました',
      });

      // 一覧画面に戻る
      router.push('/meeting-minutes');
    } catch (error: any) {
      console.error('削除エラー:', error);
      toast({
        title: '削除エラー',
        description: error.message || '削除に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  /* ================================================================
     文字起こし編集機能
     ================================================================ */
  const handleSegmentUpdate = async (segmentId: string | number, newText: string) => {
    try {
      console.log('[handleSegmentUpdate] 開始:', { segmentId, newText, meetingMinuteId });
      
      // ローカル状態を更新
      setSegments(prev => 
        prev.map(seg => 
          seg.id === segmentId ? { ...seg, text: newText } : seg
        )
      );

      // APIで更新
      const updatedSegments = segments.map(seg => 
        seg.id === segmentId ? { ...seg, text: newText } : seg
      );

      const url = `/api/meeting-minutes/${meetingMinuteId}`;
      const payload = { 
        segments: updatedSegments.map(seg => ({
          id: seg.id,
          text: seg.text,
          speakerId: seg.speakerId,
          timestamp: seg.timestamp
        }))
      };
      
      console.log('[handleSegmentUpdate] API呼び出し:', { url, payload });

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('[handleSegmentUpdate] レスポンス:', { status: res.status, ok: res.ok });

      if (!res.ok) throw new Error('セグメント更新に失敗しました');

      toast({
        title: '更新完了',
        description: '文字起こしを更新しました',
      });
    } catch (error: any) {
      console.error('セグメント更新エラー:', error);
      toast({
        title: '更新エラー',
        description: error.message || '更新に失敗しました',
        variant: 'destructive',
      });
    }
  };

  /* ================================================================
     再要約機能
     ================================================================ */
  const handleResummarize = async () => {
    setIsSummarizing(true);
    try {
      // Supabaseセッションからアクセストークンを取得
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        throw new Error('認証セッションが見つかりません');
      }

      console.log('[handleResummarize] リクエスト送信:', {
        url: '/api/meeting-minutes/summarize',
        meetingMinuteId,
        hasToken: !!session.access_token,
        tokenLength: session.access_token.length
      });

      const res = await fetch('/api/meeting-minutes/summarize', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ meetingMinuteId }),
      });

      console.log('[handleResummarize] API レスポンス:', {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries())
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[handleResummarize] API エラー:', { status: res.status, errorText });
        throw new Error(`要約生成に失敗しました (${res.status}): ${errorText}`);
      }

      const responseData = await res.json();
      console.log('[handleResummarize] レスポンスデータ:', responseData);
      
      const { summary, keywords } = responseData;
      
      // ローカル状態を更新
      setMeetingMinute(prev => prev ? { ...prev, summary, keywords } : null);

      toast({
        title: '要約完了',
        description: '議事録の要約を更新しました',
      });
    } catch (error: any) {
      console.error('要約エラー:', error);
      toast({
        title: '要約エラー',
        description: error.message || '要約生成に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  /* ================================================================
     議事録確定機能
     ================================================================ */
  const handleConfirmMinutes = async () => {
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/meeting-minutes/${meetingMinuteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          is_confirmed: true,
          confirmed_at: new Date().toISOString(),
          confirmed_by: meetingMinute?.recorded_by,
          processing_status: 'confirmed'
        }),
      });

      if (!res.ok) throw new Error('議事録確定に失敗しました');

      // ローカル状態を更新
      setMeetingMinute(prev => prev ? { 
        ...prev, 
        is_confirmed: true,
        confirmed_at: new Date().toISOString(),
        processing_status: 'confirmed'
      } : null);

      toast({
        title: '確定完了',
        description: '議事録を確定しました',
      });
    } catch (error: any) {
      console.error('確定エラー:', error);
      toast({
        title: '確定エラー',
        description: error.message || '議事録確定に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        {/* Loader2 を CuteLoadingIndicator に置き換え */}
        <CuteLoadingIndicator message="議事録を読み込んでいます..." />
        {/* <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> */}
      </div>
    );
  }

  if (!meetingMinute) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-sm text-muted-foreground">議事録が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="space-y-6">
        <MeetingMinuteHeader
          title={
            meetingMinute.meeting_date
              ? `${format(new Date(meetingMinute.meeting_date), 'yyyy年M月d日', { locale: ja })} ${meetingMinute.title}`
              : meetingMinute.title
          }
          date={
            meetingMinute.meeting_date
              ? format(new Date(meetingMinute.meeting_date), 'yyyy年M月d日(E)', { locale: ja })
              : '日付なし'
          }
          typeLabel={meetingMinute.meeting_types?.name}
          recordedBy={meetingMinute.recorded_by ?? undefined}
        />

        {cleanAudioPath && (
          <div className="p-4 bg-muted rounded-lg">
            <h3 className="text-lg font-medium mb-2 flex items-center">
              <FileAudio className="mr-2 h-5 w-5" />
              音声ファイル
            </h3>
            <AudioPlayer
              audioUrl={cleanAudioPath}
            />
            <div className="mt-2 flex justify-between items-center">
              <div className="flex space-x-2">
                {/* 編集ボタン */}
                <Button
                  variant={isEditing ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center"
                >
                  <Edit2 className="mr-1 h-4 w-4" />
                  {isEditing ? '編集終了' : '編集'}
                </Button>
                
                {/* 再要約ボタン */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResummarize}
                  disabled={isSummarizing}
                  className="flex items-center"
                >
                  {isSummarizing ? (
                    <>
                      <CuteLoadingIndicator className="mr-1 h-4 w-4" />
                      要約中...
                    </>
                  ) : (
                    <>
                      <FileAudio className="mr-1 h-4 w-4" />
                      再要約
                    </>
                  )}
                </Button>

                {/* 議事録確定ボタン */}
                {!meetingMinute.is_confirmed && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleConfirmMinutes}
                    disabled={isConfirming}
                    className="flex items-center"
                  >
                    {isConfirming ? (
                      <>
                        <CuteLoadingIndicator className="mr-1 h-4 w-4" />
                        確定中...
                      </>
                    ) : (
                      <>
                        <Save className="mr-1 h-4 w-4" />
                        議事録確定
                      </>
                    )}
                  </Button>
                )}

                {/* 削除ボタン（権限がある場合のみ表示） */}
                {meetingMinute.canDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="flex items-center"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    削除
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadFile}
                className="flex items-center"
              >
                <Download className="mr-1 h-4 w-4" />
                ダウンロード
              </Button>
            </div>
          </div>
        )}

        {/* 処理状況の表示 */}
        {meetingMinute.processing_status === 'processing' && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <CuteLoadingIndicator />
              <span className="text-blue-700">文字起こし・要約を処理中です...</span>
            </div>
          </div>
        )}

        {/* 文字起こし（segments）をチャット風に表示 */}
        {meetingMinute.is_transcribed && segments.length > 0 && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">文字起こし</h3>
              {meetingMinute.is_confirmed && (
                <span className="text-sm text-green-600 font-medium">✓ 確定済み</span>
              )}
            </div>
            <TranscriptViewer 
              segments={segments}
              isEditable={isEditing && !meetingMinute.is_confirmed}
              onSegmentUpdate={handleSegmentUpdate}
            />
          </div>
        )}

        {/* 要約 */}
        {meetingMinute.summary && (
          <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 p-4">
            <div className="font-semibold text-blue-900 mb-2">📝 要約</div>
            <div className="text-sm text-blue-800 whitespace-pre-wrap">{meetingMinute.summary}</div>
          </div>
        )}

      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>議事録を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。議事録と関連する音声ファイルが完全に削除されます。
              <br />
              <span className="font-medium text-red-600">
                {meetingMinute?.title}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
