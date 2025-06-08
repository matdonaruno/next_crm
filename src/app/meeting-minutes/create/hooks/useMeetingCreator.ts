// src/app/meeting-minutes/create/hooks/useMeetingCreator.ts
'use client';

import {
  useState, useCallback, useEffect, useMemo, useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { useAuth } from '@/contexts/AuthContext';
import useRecorder from '@/hooks/useRecorder';
import { useToast } from '@/components/ui/use-toast';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type {
  MeetingMinuteFormData,
  MeetingTypeRow,
  Profile,
} from '@/types/meeting-minutes';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/* ----------- Supabase Insert / Enum 型 ----------- */
type MeetingMinutesInsert = Database['public']['Tables']['meeting_minutes']['Insert'];
type ProcessingEnum       = Database['public']['Enums']['processing_enum'];

/* ----------- ウィザードの段階 ----------- */
const STEPS = ['info', 'record', 'transcript', 'edit'] as const;
type Step = (typeof STEPS)[number];

/* ----------- EditStep 用のローカル型定義 ----------- */
type Speaker = {
  id: string;
  name: string;
};
type Segment = {
  speakerId: string;
  text: string;
};

/* =================================================
 * useMeetingCreator – 新規議事録登録フック
 * ================================================= */
export default function useMeetingCreator() {
  const router = useRouter();
  const supabase = useSupabase();
  const { toast } = useToast();

  /* ---------- 認証まわり ---------- */
  const {
    session,
    profile: rawProfile,
    loading: authLoading,
  } = useAuth();
  const profile = rawProfile;
  const authUser = session?.user;

  /* ---------- FFmpeg 初期化 ---------- */
  const ffmpeg = useMemo(() => new FFmpeg({ log: false }), []);
  const ensureFfmpegLoaded = useCallback(async () => {
    if (!ffmpeg.loaded) await ffmpeg.load();
  }, [ffmpeg]);

  const convertToMp3 = useCallback(
    async (src: Blob) => {
      console.log('convertToMp3: 開始', { inputSize: src.size, inputType: src.type });
      if (src.size === 0) {
        throw new Error('空の音声ファイルです');
      }
      await ensureFfmpegLoaded();
      console.log('convertToMp3: FFmpeg読み込み完了');
      const inputData = await fetchFile(src);
      console.log('convertToMp3: 入力データ取得完了', { inputDataSize: inputData.length });
      if (inputData.length === 0) {
        throw new Error('音声データの読み込みに失敗しました');
      }
      const inputFileName = src.type.includes('webm') ? 'input.webm' : 'input.wav';
      await ffmpeg.writeFile(inputFileName, inputData);
      console.log('convertToMp3: ファイル書き込み完了', { fileName: inputFileName });
      await ffmpeg.exec([
        '-i', inputFileName,
        '-codec:a', 'libmp3lame',
        '-b:a', '128k',
        '-ac', '1', // モノラル
        '-ar', '44100', // サンプリングレート
        'output.mp3',
      ]);
      console.log('convertToMp3: FFmpeg変換完了');
      const outputData = await ffmpeg.readFile('output.mp3');
      console.log('convertToMp3: 出力データ読み込み完了', { outputDataSize: outputData.length });
      if (outputData.length === 0) {
        throw new Error('音声変換に失敗しました');
      }
      const outputBlob = new Blob([outputData], { type: 'audio/mpeg' });
      console.log('convertToMp3: 出力Blob作成完了', {
        outputBlobSize: outputBlob.size,
        compressionRatio: ((src.size - outputBlob.size) / src.size * 100).toFixed(1) + '%',
      });
      try {
        await ffmpeg.deleteFile(inputFileName);
        await ffmpeg.deleteFile('output.mp3');
      } catch {
        console.warn('convertToMp3: ファイルクリーンアップ警告');
      }
      return outputBlob;
    },
    [ensureFfmpegLoaded, ffmpeg],
  );

  /* ---------- 画面ステート ---------- */
  const [currentStep, setCurrentStep] = useState<Step>('info');
  const [submitting,  setSubmitting]  = useState(false);
  const [progress,    setProgress]    = useState(0);

  /* --- 入力値 --- */
  const [title,          setTitle]          = useState('');
  const [meetingTypeId,  setMeetingTypeId]  = useState('');
  const [meetingDate,    setMeetingDate]    = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localTime = new Date(now.getTime() - offset);
    return localTime.toISOString().slice(0, 16);
  });
  const [attendees,      setAttendees]      = useState('');
  const [accessLevel,    setAccessLevel]    = useState<string>('all');

  /* --- 参照データ --- */
  const [meetingTypes, setMeetingTypes] = useState<MeetingTypeRow[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  /* --- レコーダー --- */
  const {
    isRecording, duration, blob, start, stop, reset,
  } = useRecorder();
  const audioRef       = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl]   = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  /* --- DB 登録後の ID --- */
  const [minuteId, setMinuteId] = useState<string | null>(null);

  /* --- 文字起こし／編集後の状態 --- */
  const [transcriptionText, setTranscriptionText] = useState('');
  const [saveSuccess,      setSaveSuccess]      = useState(false);

  /* ─── 会議タイプマスタ取得 ─── */
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoadingTypes(true);
      const { data, error } = await supabase
        .from('meeting_types')
        .select('*')
        .order('name');
      if (error) {
        toast({
          title: '会議種別取得エラー',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        setMeetingTypes(data ?? []);
      }
      setLoadingTypes(false);
    })();
  }, [supabase, toast]);

  /* ─── Blob → 再生 URL ─── */
  useEffect(() => {
    if (!blob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  /* 再生終了でフラグ戻す ─── */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => setIsPlaying(false);
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, []);

  /* ─── 自動タイトル生成 ─── */
  const generatedTitle = useMemo(() => {
    const mt = meetingTypes.find(m => m.id === meetingTypeId);
    if (!mt) return '';
    // 日付の重複を避けるため、会議タイプ名のみを使用
    return mt.name;
  }, [meetingTypes, meetingTypeId]);

  /* ─── 録音コントロール ─── */
  const startRecording = async () => {
    try { await start(); }
    catch {
      toast({
        title: 'マイク権限エラー',
        description: 'ブラウザ設定をご確認ください',
        variant: 'destructive',
      });
    }
  };
  const deleteRecording = () => { reset(); setAudioUrl(null); };
  const togglePlayback = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) el.pause(); else el.play();
    setIsPlaying(!isPlaying);
  };
  const formatTime = (sec: number) =>
    `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60)
      .toString().padStart(2, '0')}`;

  /* ① 録音あり Insert → アップロード → 文字起こしジョブ起動 ─── */
  const processAudio = useCallback(async () => {
    if (submitting || !blob) return;

    if (!authUser || !profile) {
      toast({ title: '再ログインしてください', variant: 'destructive' });
      router.push('/login');
      return;
    }

    try {
      setSubmitting(true);
      setProgress(10);

      /* ── FFmpeg→MP3 変換 ── */
      let audioFile: Blob;
      let fileExtension: string;
      let contentType: string;
      try {
        audioFile = await convertToMp3(blob);
        fileExtension = 'mp3';
        contentType = 'audio/mpeg';
      } catch {
        toast({
          title: '変換処理',
          description: 'MP3変換に失敗したため WebM 形式で保存します。',
          variant: 'default',
        });
        audioFile = blob;
        fileExtension = 'webm';
        contentType = blob.type || 'audio/webm';
      }
      setProgress(40);

      /* ── Storage へアップロード ── */
      const key = `meeting_recordings/${profile.facility_id}/${Date.now()}.${fileExtension}`;
      const { error: upErr } = await supabase.storage
        .from('minutesaudio')
        .upload(key, audioFile, { contentType });
      if (upErr) throw upErr;
      setProgress(70);

      /* ── meeting_minutes へ Insert ── */
      const insertData: MeetingMinutesInsert = {
        title            : title || generatedTitle,
        meeting_date     : meetingDate,
        meeting_type_id  : meetingTypeId || null,
        attendees        : attendees.split(',').map((a: string) => a.trim()),
        audio_file_path  : key,
        facility_id      : profile.facility_id,
        recorded_by      : authUser.id,
        is_transcribed   : false,
        processing_status: 'queued' as ProcessingEnum,
        content          : null,
        access_level     : accessLevel,
      };

      const { data, error } = await supabase
        .from('meeting_minutes')
        .insert(insertData)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Insert failed');

      setMinuteId(data.id);
      setProgress(80);

      /* ── 非同期で文字起こしジョブを呼び出し ── */
      const { data: { session: currentSession }, error: sessionError } =
        await supabase.auth.getSession();
      if (!currentSession?.access_token) throw new Error('認証トークンが取得できませんでした');

      const transcribeResponse = await fetch('/api/meeting-minutes/transcribe', {
        method : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({
          meetingMinuteId: data.id,
          audioPath: key,
        }),
      });

      if (!transcribeResponse.ok) {
        toast({
          title: 'アップロード完了',
          description: '音声は保存されました。文字起こしはバックグラウンドで処理されます。',
          variant: 'default',
        });
      } else {
        toast({ title: 'アップロード完了', description: '文字起こしを開始しました。' });
      }

      setProgress(100);
      router.push('/meeting-minutes');
    } catch (e: any) {
      toast({
        title: 'エラー',
        description: e.message ?? '登録に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setProgress(0);
      setSubmitting(false);
    }
  }, [
    submitting, blob, title, generatedTitle, meetingTypeId,
    meetingDate, attendees, supabase, authUser, profile,
    toast, router, convertToMp3,
  ]);

  /* ② 録音なし Insert／Update or 編集後保存 ─── */
  const saveMeetingMinute = useCallback(
    async (
      form: MeetingMinuteFormData
        | { segments: Segment[]; speakers: Speaker[] }
    ) => {
      if (submitting || !authUser) return;

      try {
        setSubmitting(true);

        if ('segments' in form && 'speakers' in form) {
          // 「EditStep」から呼び出される場合
          const segments = form.segments;
          const speakers = form.speakers;

          // 例として content に JSON.stringify(segments) で保存し、summary に transcriptionText を保存
          const { error: updErr } = await supabase
            .from('meeting_minutes')
            .update({
              content: JSON.stringify(segments),
              summary: transcriptionText,
              processing_status: 'done',
            })
            .eq('id', minuteId);

          if (updErr) throw updErr;
          setSaveSuccess(true);
        } else {
          // 「InfoStep→保存」 または「録音せず保存」など
          const f = form as MeetingMinuteFormData;
          const body: MeetingMinutesInsert = {
            title            : f.title,
            meeting_date     : f.meeting_date,
            meeting_type_id  : f.meeting_type_id,
            attendees        : f.attendees.split(',').map((a: string) => a.trim()),
            facility_id      : profile?.facility_id ?? null,
            recorded_by      : authUser.id,
            is_transcribed   : false,
            content          : null,
            processing_status: 'done',
            audio_file_path  : null,
            access_level     : accessLevel,
          };

          if (minuteId) {
            const { error: updErr } = await supabase
              .from('meeting_minutes')
              .update(body)
              .eq('id', minuteId);
            if (updErr) throw updErr;
          } else {
            const { data, error: insErr } = await supabase
              .from('meeting_minutes')
              .insert(body)
              .select()
              .single();
            if (insErr || !data) throw insErr ?? new Error('Insert failed');
            setMinuteId(data.id);
          }
          setSaveSuccess(true);
        }

        toast({ title: '保存しました' });
      } catch (e: any) {
        toast({ title: '保存エラー', description: e.message, variant: 'destructive' });
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, authUser, supabase, profile, minuteId, transcriptionText, toast],
  );

  return {
    state: {
      authLoading,
      currentStep,
      submitting,
      progress,
      title,
      meetingTypeId,
      meetingDate,
      attendees,
      accessLevel,
      meetingTypes,
      loadingTypes,
      generatedTitle,
      isRecording,
      duration,
      blob,
      audioRef,
      audioUrl,
      isPlaying,
      transcriptionText,
      saveSuccess,
    },
    actions: {
      setCurrentStep,
      nextStep: () => setCurrentStep((s) => {
        if (s === 'info') return 'record';
        if (s === 'record') return 'transcript';
        if (s === 'transcript') return 'edit';
        return s;
      }),
      prevStep: () => setCurrentStep((s) => {
        if (s === 'edit') return 'transcript';
        if (s === 'transcript') return 'record';
        if (s === 'record') return 'info';
        return s;
      }),
      setTitle,
      setMeetingTypeId,
      setMeetingDate,
      setAttendees,
      setAccessLevel,
      startRecording,
      stopRecording: stop,
      deleteRecording,
      togglePlayback,
      formatTime,
      processAudio,
      saveMeetingMinute,
    },
  };
}