'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { 
  Mic, 
  MicOff, 
  Play, 
  Pause, 
  Trash, 
  Upload, 
  Save, 
  X, 
  ChevronDown,
  Edit,
  RefreshCw,
  UserCircle,
  UserPlus,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { transcribeAudio, summarizeText } from '@/lib/openai';
import { MeetingType, AudioRecordingData } from '@/types/meeting-minutes';

// 話者の型定義
interface Speaker {
  id: string;
  name: string;
  color: string;
}

// 話者分けされた文字起こしの型定義
interface TranscriptSegment {
  speakerId: string;
  text: string;
}

// 音声波形コンポーネント
const Waveform = ({ isRecording }: { isRecording: boolean }) => {
  return (
    <div className="flex items-center justify-center h-16 mt-4 mb-6">
      {isRecording ? (
        <div className="flex items-end space-x-1">
          {Array.from({ length: 20 }).map((_, i) => {
            const height = Math.max(10, Math.floor(Math.random() * 40));
            return (
              <div
                key={i}
                className={`w-1.5 bg-gradient-to-t from-pink-400 to-purple-500 rounded-full animate-pulse`}
                style={{
                  height: `${height}px`,
                  animationDelay: `${i * 0.05}s`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex items-end space-x-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-2 bg-pink-100 rounded-full"
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 装飾用の浮遊する要素のコンポーネント
const FloatingElements = () => {
  return (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: `${Math.random() * 15 + 5}px`,
            height: `${Math.random() * 15 + 5}px`,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.4 + 0.1,
            boxShadow: "0 0 8px rgba(255, 255, 255, 0.6)",
            animation: `float ${Math.random() * 10 + 20}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function CreateMeetingMinuteClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, profile } = useAuth();

  // 状態管理
  const [isLoading, setIsLoading] = useState(false);
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioRecording, setAudioRecording] = useState<AudioRecordingData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [summary, setSummary] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<'info' | 'record' | 'transcript' | 'edit'>('info');
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // 話者関連の状態
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: '1', name: '進行役', color: '#8167a9' },
    { id: '2', name: '参加者A', color: '#ef476f' }
  ]);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState('1');
  
  // フォームの状態
  const [title, setTitle] = useState('');
  const [meetingTypeId, setMeetingTypeId] = useState('');
  const [meetingDate, setMeetingDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [attendees, setAttendees] = useState('');

  // 録音関連の参照
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ハードコードされた会議種類データ（データ取得に失敗した場合のフォールバック）
  const hardcodedMeetingTypes: MeetingType[] = [
    {
      id: '6b2df503-1ed8-4314-b5e3-73c38268a26c',
      name: '検査室内会議',
      description: '部門内での定例会議',
      facility_id: '',
      created_at: '2025-04-12T13:34:36.105224+00',
      updated_at: '2025-04-12T13:34:36.105224+00'
    },
    {
      id: '152f63d8-0252-4ba5-b12d-f13710c59fad',
      name: '朝礼',
      description: '朝の業務確認会議',
      facility_id: '',
      created_at: '2025-04-12T13:34:36.105224+00',
      updated_at: '2025-04-12T13:34:36.105224+00'
    },
    {
      id: 'caea3d76-992a-4bfc-9881-46dda30d111a',
      name: 'スタッフミーティング',
      description: 'スタッフでの情報共有会議',
      facility_id: '',
      created_at: '2025-04-12T13:34:36.105224+00',
      updated_at: '2025-04-12T13:34:36.105224+00'
    },
    {
      id: 'cd02ea21-caf5-4ed2-9b5e-4b215b2f9e02',
      name: '委員会会議',
      description: '院内委員会での会議',
      facility_id: '',
      created_at: '2025-04-12T13:34:36.105224+00',
      updated_at: '2025-04-12T13:34:36.105224+00'
    },
    {
      id: '7e2f3a2e-630d-48bc-ba2f-6a6c2ec78a0e',
      name: '役職会議',
      description: '主任や技師長会議',
      facility_id: '',
      created_at: '2025-04-12T13:34:36.105224+00',
      updated_at: '2025-04-12T13:34:36.105224+00'
    },
    {
      id: '48eaada8-a3aa-4247-ae54-6150fdde9068',
      name: '研修会',
      description: '研修や勉強会',
      facility_id: '',
      created_at: '2025-04-12T13:34:36.105224+00',
      updated_at: '2025-04-12T13:34:36.105224+00'
    }
  ];

  // 会議種類データの取得
  const fetchMeetingTypes = useCallback(async () => {
    try {
      console.log('会議種類データ取得開始');
      console.log('認証状態:', { userId: user?.id, facilityId: profile?.facility_id });
      
      // 方法0: APIエンドポイント経由（認証トークン付き）
      try {
        console.log('方法0: APIエンドポイント経由');
        const response = await fetch(`/api/meeting-minutes/types`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user?.id || ''}`,
          }
        });
        
        const apiResult = await response.json();
        console.log('API経由結果:', { 
          status: response.status, 
          ok: response.ok,
          data: apiResult, 
          dataLength: Array.isArray(apiResult) ? apiResult.length : 'not array' 
        });
        
        if (response.ok && Array.isArray(apiResult) && apiResult.length > 0) {
          console.log('APIから正常にデータ取得。データを設定します');
          setMeetingTypes(apiResult);
          return; // 成功したら終了
        }
      } catch (apiError) {
        console.error('API経由でのデータ取得エラー:', apiError);
      }
      
      // Supabaseでスキーマ情報を確認
      try {
        console.log('テーブル構造確認');
        const { data: schemaData, error: schemaError } = await supabase
          .rpc('get_table_info', { table_name: 'meeting_types' });
          
        console.log('テーブル構造:', { schemaData, schemaError });
      } catch (schemaErr) {
        console.error('テーブル構造取得エラー:', schemaErr);
      }
      
      // 詳細なエラーログのためのオプション
      const options = { count: 'exact' as const };
      
      // 方法1: 基本的なクエリ
      console.log('方法1: 基本的なクエリを実行');
      const { data, error, count } = await supabase
        .from('meeting_types')
        .select('*', options)
        .order('name');
      
      console.log('方法1の結果:', { data, error, count, dataLength: data?.length });
      
      if (error) {
        console.error('方法1でエラー発生:', error);
      }
      
      // 方法2: RLSの可能性を考慮したクエリ（サービスロール使用）
      console.log('方法2: RLSの可能性を確認');
      try {
        const { data: data2, error: error2 } = await supabase
          .rpc('get_meeting_types');
          
        console.log('方法2の結果:', { data: data2, error: error2 });
      } catch (rpcErr) {
        console.error('RPC呼び出しエラー:', rpcErr);
      }
      
      // 方法3: シンプルなテーブル内容確認
      console.log('方法3: テーブルの行数確認');
      const { count: totalCount, error: countError } = await supabase
        .from('meeting_types')
        .select('*', { count: 'exact', head: true });
        
      console.log('方法3の結果:', { totalCount, countError });
      
      // データが取得できた場合
      if (data && data.length > 0) {
        console.log('データ取得成功。データを設定します');
        setMeetingTypes(data);
      } 
      // データが空の場合はハードコードデータを使用
      else {
        console.log('データが空のため、ハードコードされたデータを使用します');
        setMeetingTypes(hardcodedMeetingTypes);
        
        // 会議種類テーブルにデータを挿入（一時的な対応）
        try {
          console.log('会議種類テーブルにデータを挿入します');
          const { data: insertData, error: insertError } = await supabase
            .from('meeting_types')
            .upsert(hardcodedMeetingTypes.map(type => ({
              id: type.id,
              name: type.name,
              description: type.description,
              facility_id: profile?.facility_id || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })))
            .select();
            
          console.log('データ挿入結果:', { insertData, insertError });
          
          if (!insertError && insertData && insertData.length > 0) {
            console.log('挿入したデータを使用します');
            setMeetingTypes(insertData);
          }
        } catch (insertErr) {
          console.error('データ挿入エラー:', insertErr);
        }
      }
    } catch (error) {
      console.error('会議種類データの取得エラー:', error);
      console.log('エラーが発生したため、ハードコードされたデータを使用します');
      setMeetingTypes(hardcodedMeetingTypes);
      
      toast({
        title: '警告',
        description: 'データベースからの会議種類の取得に失敗しました。代替データを使用します。',
        variant: 'destructive',
      });
    }
  }, [toast, user?.id, profile?.facility_id]);

  // 初期データ読み込み
  useEffect(() => {
    fetchMeetingTypes();
  }, [fetchMeetingTypes]);

  // タイマー処理用のエフェクト
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // 録音開始
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // 録音データの準備
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        // この時点でのrecordingTimeを使用
        const currentDuration = recordingTime;
        
        console.log('MediaRecorder onstop - 録音時間:', currentDuration);
        
        setAudioRecording({
          audioBlob,
          duration: currentDuration,
          filename: `meeting_recording_${new Date().getTime()}.wav`
        });
        
        // ストリームのトラックを停止
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      toast({
        title: '録音開始',
        description: '会議の録音を開始しました',
      });
    } catch (error) {
      console.error('録音の開始に失敗しました:', error);
      toast({
        title: 'エラー',
        description: '録音の開始に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // 録音停止
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // 現在の録音時間を保存
      const finalRecordingTime = recordingTime;
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // onstopイベントが発火する前に直接設定しておく
      setTimeout(() => {
        if (!audioRecording) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          setAudioRecording({
            audioBlob,
            duration: finalRecordingTime,
            filename: `meeting_recording_${new Date().getTime()}.wav`
          });
        }
      }, 200);
      
      toast({
        title: '録音停止',
        description: `会議の録音を停止しました (${formatTime(finalRecordingTime)})`,
      });
      
      console.log('録音停止 - 録音時間:', finalRecordingTime);
    }
  };

  // 録音削除
  const deleteRecording = () => {
    setAudioRecording(null);
    setTranscriptionText('');
    setSummary('');
    setKeywords([]);
    setTranscriptSegments([]);
    
    toast({
      title: '録音削除',
      description: '録音データを削除しました',
    });
  };

  // 文字起こしをセグメントに変換
  const convertTextToSegments = (text: string) => {
    // シンプルな初期分割 - 段落ごとに交互に話者を割り当て
    const paragraphs = text.split(/\n\s*\n/);
    
    return paragraphs.map((paragraph, index) => ({
      speakerId: (index % speakers.length + 1).toString(),
      text: paragraph.trim()
    }));
  };

  // 文字起こし処理
  const processAudio = async () => {
    if (!audioRecording) return;
    
    setIsProcessing(true);
    
    try {
      // 音声ファイルの作成
      const audioFile = new File(
        [audioRecording.audioBlob], 
        audioRecording.filename, 
        { type: 'audio/wav' }
      );
      
      // 文字起こし
      toast({
        title: '処理中',
        description: '音声の文字起こしを開始しました。しばらくお待ちください...',
      });
      
      const transcriptionResult = await transcribeAudio(audioFile);
      setTranscriptionText(transcriptionResult);
      
      // 文字起こしを話者ごとに分割
      const segments = convertTextToSegments(transcriptionResult);
      setTranscriptSegments(segments);
      
      // 要約とキーワード抽出
      if (transcriptionResult) {
        toast({
          title: '処理中',
          description: 'テキストの要約とキーワード抽出を行っています...',
        });
        
        const result = await summarizeText(transcriptionResult);
        if (result.summary) setSummary(result.summary);
        if (result.keywords) setKeywords(result.keywords);
        
        // タイトル自動設定（未入力の場合）
        if (!title && result.summary) {
          const summaryLines = result.summary.split('\n');
          setTitle(summaryLines[0].substring(0, 50));
        }
      }
      
      toast({
        title: '処理完了',
        description: '音声の文字起こしと要約が完了しました',
      });
      
      // 編集ステップに移動
      setCurrentStep('edit');
    } catch (error) {
      console.error('音声処理エラー:', error);
      toast({
        title: 'エラー',
        description: '音声の処理中にエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // フォーマット関数を追加
  const formatSegmentWithSpeaker = (segmentText: string, speakerName: string) => {
    return speakerName ? `${speakerName}：${segmentText}` : segmentText;
  };

  // セグメントの編集関数を修正
  const updateSegment = (index: number, newText: string) => {
    const newSegments = [...transcriptSegments];
    newSegments[index] = {
      ...newSegments[index],
      text: newText
    };
    setTranscriptSegments(newSegments);
  };

  // 話者の変更
  const changeSpeaker = (index: number, speakerId: string) => {
    const newSegments = [...transcriptSegments];
    newSegments[index] = {
      ...newSegments[index],
      speakerId
    };
    setTranscriptSegments(newSegments);
  };

  // 話者の追加
  const addSpeaker = () => {
    const newId = (speakers.length + 1).toString();
    const colors = ['#8167a9', '#ef476f', '#06d6a0', '#118ab2', '#ffd166'];
    const colorIndex = speakers.length % colors.length;
    
    setSpeakers([
      ...speakers,
      { id: newId, name: `参加者${newId}`, color: colors[colorIndex] }
    ]);
  };

  // 話者名の編集
  const updateSpeakerName = (id: string, newName: string) => {
    setSpeakers(speakers.map(speaker => 
      speaker.id === id ? { ...speaker, name: newName } : speaker
    ));
  };

  // セグメントを追加
  const addSegmentAfter = (index: number) => {
    const newSegments = [...transcriptSegments];
    newSegments.splice(index + 1, 0, {
      speakerId: activeSpeakerId,
      text: ''
    });
    setTranscriptSegments(newSegments);
  };

  // セグメントを削除
  const removeSegment = (index: number) => {
    const newSegments = [...transcriptSegments];
    newSegments.splice(index, 1);
    setTranscriptSegments(newSegments);
  };

  // 編集後の再要約
  const regenerateSummary = async () => {
    setIsProcessing(true);
    
    try {
      // 全テキストを結合（話者名付き）
      const fullText = transcriptSegments
        .map(segment => {
          const speaker = speakers.find(s => s.id === segment.speakerId) || speakers[0];
          return `${speaker.name}：${segment.text}`;
        })
        .join('\n\n');
      
      setTranscriptionText(fullText);
      
      // 要約とキーワード抽出
      const result = await summarizeText(fullText);
      if (result.summary) setSummary(result.summary);
      if (result.keywords) setKeywords(result.keywords);
      
      toast({
        title: '更新完了',
        description: '要約とキーワードが更新されました',
      });
    } catch (error) {
      console.error('再要約エラー:', error);
      toast({
        title: 'エラー',
        description: '要約の更新に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 会議議事録の保存
  const saveMeetingMinute = async () => {
    // バリデーション
    if (!title) {
      toast({
        title: 'エラー',
        description: 'タイトルを入力してください',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }
    
    if (!meetingTypeId) {
      toast({
        title: 'エラー',
        description: '会議種類を選択してください',
        variant: 'destructive', 
        duration: 5000,
      });
      return;
    }
    
    setIsLoading(true);
    
    // 保存中の通知
    toast({
      title: '保存中',
      description: '会議議事録を保存しています...',
      duration: 3000,
    });
    
    try {
      // 音声ファイルのアップロード
      let audioFilePath = null;
      if (audioRecording) {
        const fileExt = audioRecording.filename.split('.').pop();
        const filePath = `meeting_recordings/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('meeting_minutes')
          .upload(filePath, audioRecording.audioBlob);
          
        if (uploadError) {
          console.error('音声ファイルのアップロードエラー:', uploadError);
          throw new Error('音声ファイルのアップロードに失敗しました');
        }
        
        audioFilePath = filePath;
        console.log('音声ファイルのアップロード成功:', audioFilePath);
      }
      
      // 参加者の処理
      const attendeesList = attendees
        .split(',')
        .map(name => name.trim())
        .filter(name => name);
      
      // 話者情報とセグメント情報をJSON化
      const speakersData = JSON.stringify(speakers);
      const segmentsData = JSON.stringify(transcriptSegments);
      
      // 全テキスト結合（話者名付き）
      const fullText = transcriptSegments
        .map(segment => {
          const speaker = speakers.find(s => s.id === segment.speakerId) || speakers[0];
          return `${speaker.name}：${segment.text}`;
        })
        .join('\n\n');
      
      // 会議議事録の保存
      const { data, error } = await supabase
        .from('meeting_minutes')
        .insert({
          title,
          meeting_type_id: meetingTypeId,
          meeting_date: meetingDate,
          recorded_by: user?.id,
          facility_id: profile?.facility_id,
          attendees: attendeesList,
          content: fullText,
          summary,
          keywords,
          audio_file_path: audioFilePath,
          is_transcribed: !!transcriptionText,
          speakers: speakersData,
          segments: segmentsData
        })
        .select();
        
      if (error) {
        console.error('会議議事録の保存エラー詳細:', error);
        
        // エラーの種類に応じたメッセージ
        let errorMessage = '会議議事録の保存に失敗しました';
        
        // カラム不足エラーの場合
        if (error.message && error.message.includes('column') && error.message.includes('not found')) {
          errorMessage = 'データベースの構成が正しくありません。管理者に連絡してください。';
        }
        // 外部キー制約エラーの場合
        else if (error.message && error.message.includes('foreign key constraint')) {
          errorMessage = '関連データに問題があります。選択した会議種類が正しいか確認してください。';
        }
        // その他のエラー
        else if (error.message) {
          errorMessage = `保存中にエラーが発生しました: ${error.message}`;
        }
        
        throw new Error(errorMessage);
      }
      
      // 成功通知
      toast({
        title: '保存完了',
        description: '会議議事録を保存しました',
        duration: 5000,
      });
      
      // 成功フラグを設定
      setSaveSuccess(true);
      
    } catch (error: any) {
      console.error('会議議事録の保存エラー:', error);
      
      // エラーメッセージを表示
      toast({
        title: 'エラー',
        description: error.message || '会議議事録の保存に失敗しました',
        variant: 'destructive',
        duration: 10000, // 長めに表示
      });
      
      // スクロールして保存ボタンが見えるようにする
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
      
    } finally {
      setIsLoading(false);
    }
  };

  // キャンセル処理
  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    router.push('/meeting-minutes');
  };

  // 録音時間のフォーマット修正
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 次のステップへ進む
  const nextStep = () => {
    if (currentStep === 'info') {
      setCurrentStep('record');
    } else if (currentStep === 'record' && audioRecording) {
      setCurrentStep('transcript');
    }
  };

  // 前のステップに戻る
  const prevStep = () => {
    if (currentStep === 'record') {
      setCurrentStep('info');
    } else if (currentStep === 'transcript') {
      setCurrentStep('record');
    } else if (currentStep === 'edit') {
      setCurrentStep('transcript');
    }
  };

  // ステップ表示
  const renderStep = () => {
    switch(currentStep) {
      case 'info':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <Card className="p-5 mb-6 rounded-xl shadow-sm bg-white/80 backdrop-blur-sm border-pink-100">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title" className="text-base font-semibold text-gray-700">タイトル</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 h-12 text-base rounded-xl border-pink-200 focus:border-purple-400 focus:ring-purple-300"
                    placeholder="会議のタイトルを入力"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label htmlFor="meeting-type" className="text-base font-semibold text-gray-700">会議種類</Label>
                  <Select
                    value={meetingTypeId}
                    onValueChange={setMeetingTypeId}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="mt-1 h-12 text-base rounded-xl border-pink-200 focus:border-purple-400 focus:ring-purple-300">
                      <SelectValue placeholder="会議種類を選択" />
                    </SelectTrigger>
                    <SelectContent className="bg-white/90 backdrop-blur-sm border-pink-100">
                      {meetingTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="meeting-date" className="text-base font-semibold text-gray-700">会議日時</Label>
                  <Input
                    id="meeting-date"
                    type="datetime-local"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1 h-12 text-base rounded-xl border-pink-200 focus:border-purple-400 focus:ring-purple-300"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label htmlFor="attendees" className="text-base font-semibold text-gray-700">参加者（カンマ区切り）</Label>
                  <Input
                    id="attendees"
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    className="mt-1 h-12 text-base rounded-xl border-pink-200 focus:border-purple-400 focus:ring-purple-300"
                    placeholder="例: 山田太郎, 鈴木花子, 佐藤次郎"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </Card>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="rounded-xl h-14 text-base border-pink-200 text-pink-600 hover:bg-pink-50"
              >
                キャンセル
              </Button>
              
              <Button
                onClick={nextStep}
                className="rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                disabled={!title || !meetingTypeId}
              >
                次へ <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        );
        
      case 'record':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <Card className="p-6 mb-6 rounded-xl shadow-md border border-pink-100 bg-white/80 backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
                <Mic className="h-5 w-5 mr-2 text-pink-400" />
                音声録音
              </h2>
              
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl border-pink-200 bg-white/60">
                {isRecording ? (
                  <div className="flex flex-col items-center space-y-6 w-full">
                    <div className="relative w-full">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl font-mono text-red-600">{formatTime(recordingTime)}</span>
                      </div>
                      <Waveform isRecording={true} />
                    </div>
                    
                    <div className="flex items-center justify-center w-full">
                      <div className="animate-pulse mr-3 bg-red-100 px-3 py-1 rounded-full text-red-600 text-sm font-medium">
                        録音中
                      </div>
                      <Button
                        variant="destructive"
                        size="lg"
                        onClick={stopRecording}
                        disabled={isLoading}
                        className="rounded-full h-16 w-16 p-0 shadow-lg"
                      >
                        <MicOff className="h-8 w-8" />
                      </Button>
                    </div>
                  </div>
                ) : audioRecording ? (
                  <div className="flex flex-col items-center space-y-6 w-full">
                    <div className="bg-white/90 rounded-xl p-6 w-full shadow-sm border border-pink-100">
                      <div className="text-center">
                        <h3 className="font-semibold text-lg bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">録音完了</h3>
                        <div className="mt-3 flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 bg-pink-400 rounded-full"></div>
                          <p className="text-base text-gray-600">
                            長さ: {audioRecording?.duration ? formatTime(audioRecording.duration) : "00:00"}
                          </p>
                        </div>
                      </div>
                      
                      <Waveform isRecording={false} />
                      
                      <div className="flex justify-center space-x-4 mt-4">
                        <Button
                          variant="outline"
                          onClick={deleteRecording}
                          disabled={isLoading}
                          className="rounded-xl px-6 py-2 text-sm border-red-200 text-red-600 hover:bg-red-50 w-full"
                        >
                          <Trash className="mr-2 h-4 w-4" /> 削除
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-6">
                    <div className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-full p-8">
                      <Mic className="h-16 w-16 text-pink-500" />
                    </div>
                    <p className="text-center text-gray-600 text-lg max-w-xs">
                      録音ボタンをタップして会議を録音します。高品質な文字起こしのために静かな環境で録音してください。
                    </p>
                    <Button
                      size="lg"
                      onClick={startRecording}
                      disabled={isLoading}
                      className="rounded-full h-16 w-16 p-0 shadow-lg bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 transition-all"
                    >
                      <Mic className="h-8 w-8" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={prevStep}
                className="rounded-xl h-14 text-base border-pink-200 text-pink-600 hover:bg-pink-50"
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> 戻る
              </Button>
              
              {audioRecording && (
                <Button
                  onClick={nextStep}
                  className="rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  次へ <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              )}
            </div>
          </motion.div>
        );
        
      case 'transcript':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <Card className="p-4 mb-6 rounded-xl border border-pink-100 bg-white/80 backdrop-blur-sm shadow-md">
              <h2 className="text-xl font-semibold mb-4 bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent flex items-center">
                <Upload className="h-5 w-5 mr-2 text-pink-400" />
                文字起こし
              </h2>
              
              {isProcessing ? (
                <div className="flex flex-col justify-center items-center h-60 p-8">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-pink-400"></div>
                  <span className="mt-6 text-lg">文字起こし処理中...</span>
                </div>
              ) : transcriptionText ? (
                <div className="space-y-4">
                  <Button
                    onClick={() => setCurrentStep('edit')}
                    className="w-full rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                  >
                    <Edit className="mr-2 h-5 w-5" /> 文字起こし結果を編集
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col justify-center items-center p-8">
                  <Button
                    onClick={processAudio}
                    disabled={!audioRecording || isProcessing}
                    className="rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                  >
                    <Upload className="mr-2 h-5 w-5" /> 文字起こし開始
                  </Button>
                </div>
              )}
            </Card>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={isProcessing}
                className="rounded-xl h-14 text-base border-pink-200 text-pink-600 hover:bg-pink-50"
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> 戻る
              </Button>
              
              {transcriptionText && !saveSuccess && (
                <Button
                  onClick={saveMeetingMinute}
                  disabled={isProcessing}
                  className="rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-white border-t-transparent rounded-full" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" /> 保存
                    </>
                  )}
                </Button>
              )}

              {transcriptionText && saveSuccess && (
                <Button
                  onClick={() => router.push('/meeting-minutes')}
                  className="rounded-xl h-14 text-base bg-gradient-to-r from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" /> 一覧に戻る
                </Button>
              )}
            </div>
          </motion.div>
        );
        
      case 'edit':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <Card className="p-4 mb-6 rounded-xl overflow-hidden border border-pink-100 bg-white/80 backdrop-blur-sm shadow-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">文字起こし編集</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSpeaker}
                  className="rounded-full border-pink-200 text-pink-600 hover:bg-pink-50"
                >
                  <UserPlus className="h-4 w-4 mr-2" /> 話者追加
                </Button>
              </div>
              
              {/* 話者リスト */}
              <div className="flex flex-wrap gap-2 mb-4">
                {speakers.map(speaker => (
                  <div 
                    key={speaker.id} 
                    className="flex items-center bg-white/60 rounded-full px-3 py-1 border border-pink-100"
                    style={{ borderLeft: `4px solid ${speaker.color}` }}
                  >
                    <Input
                      value={speaker.name}
                      onChange={(e) => updateSpeakerName(speaker.id, e.target.value)}
                      className="border-none bg-transparent p-0 h-6 w-20 text-sm focus-visible:ring-0"
                    />
                  </div>
                ))}
              </div>
              
              {/* 話者選択とセグメント */}
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {transcriptSegments.map((segment, index) => {
                  const speaker = speakers.find(s => s.id === segment.speakerId) || speakers[0];
                  
                  // 表示用のテキストを準備（話者名を含む）
                  const displayText = segment.text;
                  
                  return (
                    <div 
                      key={index} 
                      className="border rounded-xl p-3 bg-white/60 border-pink-100"
                      style={{ borderLeft: `4px solid ${speaker.color}` }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center">
                          <div 
                            className="w-3 h-3 rounded-full mr-2" 
                            style={{ backgroundColor: speaker.color }}
                          ></div>
                          <Select
                            value={segment.speakerId}
                            onValueChange={(value) => changeSpeaker(index, value)}
                          >
                            <SelectTrigger className="h-8 w-32 text-sm border-pink-200 focus:border-purple-400 focus:ring-purple-300">
                              <SelectValue>{speaker.name}</SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-white/90 backdrop-blur-sm border-pink-100">
                              {speakers.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addSegmentAfter(index)}
                            className="h-8 w-8 p-0 rounded-full text-pink-500 hover:bg-pink-50"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSegment(index)}
                            className="h-8 w-8 p-0 rounded-full text-red-500 hover:bg-red-50"
                            disabled={transcriptSegments.length <= 1}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="relative">
                        <div className="absolute top-3 left-3 font-semibold text-pink-500 whitespace-nowrap z-10">
                          {`${speaker.name}：`}
                        </div>
                        <Textarea
                          value={displayText}
                          onChange={(e) => updateSegment(index, e.target.value)}
                          placeholder="文字起こし内容"
                          className="mt-1 min-h-36 text-base border-pink-100 focus:border-purple-400 focus:ring-purple-300 bg-white/80 text-left whitespace-pre-wrap pl-[calc(1rem+max(3.5rem,25%))]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {transcriptSegments.length === 0 && !isProcessing && (
                <div className="text-center p-4 text-gray-500">
                  文字起こしデータがありません
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t">
                <Button
                  onClick={regenerateSummary}
                  disabled={isProcessing || transcriptSegments.length === 0}
                  className="w-full rounded-xl h-12 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  <RefreshCw className={`mr-2 h-5 w-5 ${isProcessing ? 'animate-spin' : ''}`} /> 
                  要約を再生成
                </Button>
              </div>
            </Card>
            
            {/* 要約とキーワード */}
            <Card className="p-4 mb-6 rounded-xl border border-pink-100 bg-white/80 backdrop-blur-sm shadow-md">
              <h2 className="text-xl font-semibold mb-4 bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
                要約・キーワード
              </h2>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="summary" className="text-base font-semibold text-gray-700">要約</Label>
                  <Textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="mt-1 min-h-48 text-base rounded-xl border-pink-200 focus:border-purple-400 focus:ring-purple-300 bg-white/80 text-left whitespace-pre-wrap leading-relaxed p-4"
                    placeholder="会議の要約"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label className="text-base font-semibold text-gray-700">キーワード</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword, idx) => (
                      <div key={idx} className="flex items-center bg-gradient-to-r from-pink-50 to-purple-50 rounded-full px-3 py-1 border border-pink-100">
                        <span className="text-sm">{keyword}</span>
                        <button
                          type="button"
                          className="ml-1 text-gray-500 hover:text-red-500"
                          onClick={() => {
                            const newKeywords = [...keywords];
                            newKeywords.splice(idx, 1);
                            setKeywords(newKeywords);
                          }}
                          disabled={isLoading}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <Input
                      className="w-40 h-8 rounded-full border-pink-200 focus:border-purple-400 focus:ring-purple-300"
                      placeholder="キーワード追加"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          e.preventDefault();
                          setKeywords([...keywords, e.currentTarget.value.trim()]);
                          e.currentTarget.value = '';
                        }
                      }}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>
            </Card>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentStep('transcript')}
                disabled={isProcessing}
                className="rounded-xl h-14 text-base border-pink-200 text-pink-600 hover:bg-pink-50"
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> 戻る
              </Button>
              
              {!saveSuccess && (
                <Button
                  onClick={saveMeetingMinute}
                  disabled={isLoading || isProcessing}
                  className="rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-white border-t-transparent rounded-full" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" /> 保存
                    </>
                  )}
                </Button>
              )}

              {saveSuccess && (
                <Button
                  onClick={() => router.push('/meeting-minutes')}
                  className="rounded-xl h-14 text-base bg-gradient-to-r from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" /> 一覧に戻る
                </Button>
              )}
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 pb-20 relative">
      <FloatingElements />

      {/* AppHeaderコンポーネントを使用 */}
      <AppHeader 
        title="会議議事録作成" 
        icon={<Mic className="h-5 w-5 text-pink-400" />}
        onBackClick={handleCancel}
      />
      
      <div className="container p-4 mx-auto max-w-md">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      {/* 装飾要素 - 右下 */}
      <div className="absolute bottom-4 right-4 pointer-events-none z-0 opacity-30">
        <RefreshCw className="h-16 w-16 text-purple-300" />
      </div>
    </div>
  );
} 