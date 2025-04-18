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
  ArrowLeft,
  FileText
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
import supabaseClient from '@/lib/supabaseClient';
import { transcribeAudio, summarizeText } from '@/lib/openai';
import { MeetingType, AudioRecordingData } from '@/types/meeting-minutes';
import { ja } from 'date-fns/locale';

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

// 型の定義を追加 (importセクションの下)
type StepType = 'info' | 'record' | 'transcript' | 'edit';

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
  const [currentStep, setCurrentStep] = useState<StepType>('info');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [audioFilePath, setAudioFilePath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
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
        const { data: schemaData, error: schemaError } = await supabaseClient
          .rpc('get_table_info', { table_name: 'meeting_types' });
          
        console.log('テーブル構造:', { schemaData, schemaError });
      } catch (schemaErr) {
        console.error('テーブル構造取得エラー:', schemaErr);
      }
      
      // 詳細なエラーログのためのオプション
      const options = { count: 'exact' as const };
      
      // 方法1: 基本的なクエリ
      console.log('方法1: 基本的なクエリを実行');
      const { data, error, count } = await supabaseClient
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
        const { data: data2, error: error2 } = await supabaseClient
          .rpc('get_meeting_types');
          
        console.log('方法2の結果:', { data: data2, error: error2 });
      } catch (rpcErr) {
        console.error('RPC呼び出しエラー:', rpcErr);
      }
      
      // 方法3: シンプルなテーブル内容確認
      console.log('方法3: テーブルの行数確認');
      const { count: totalCount, error: countError } = await supabaseClient
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
          const { data: insertData, error: insertError } = await supabaseClient
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
    
    // 会議名の初期設定
    if (!title) {
      // 現在日付と「会議」で仮タイトルを設定
      const today = new Date();
      const formattedDate = format(today, 'yyyy年MM月dd日', { locale: ja });
      setTitle(`${formattedDate} 会議`);
    }
  }, [fetchMeetingTypes, title]);

  // 会議種類が変更された時にタイトルを自動生成
  useEffect(() => {
    // 会議種類が選択されたとき
    if (meetingTypeId) {
      const selectedType = meetingTypes.find(type => type.id === meetingTypeId);
      if (selectedType) {
        // 日付と会議種類を組み合わせてタイトルを生成
        const meetingDateObj = new Date(meetingDate);
        const formattedDate = format(meetingDateObj, 'yyyy年MM月dd日', { locale: ja });
        
        // タイトルが初期値のまま、または未設定の場合のみ自動設定
        if (!title || title === `${format(new Date(), 'yyyy年MM月dd日', { locale: ja })} 会議`) {
          setTitle(`${formattedDate} ${selectedType.name}`);
        }
      }
    }
  }, [meetingTypeId, meetingTypes, meetingDate, title]);
  
  // 会議日時が変更された時もタイトルを更新
  const handleMeetingDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setMeetingDate(newDate);
    
    // 既に会議種類が選択されている場合は、タイトルも更新
    if (meetingTypeId) {
      const selectedType = meetingTypes.find(type => type.id === meetingTypeId);
      if (selectedType) {
        const meetingDateObj = new Date(newDate);
        const formattedDate = format(meetingDateObj, 'yyyy年MM月dd日', { locale: ja });
        
        // タイトルが自動生成されたものである場合のみ更新
        const oldDate = format(new Date(meetingDate), 'yyyy年MM月dd日', { locale: ja });
        const currentTypeTitle = `${oldDate} ${selectedType.name}`;
        
        if (title === currentTypeTitle || !title || title === `${format(new Date(), 'yyyy年MM月dd日', { locale: ja })} 会議`) {
          setTitle(`${formattedDate} ${selectedType.name}`);
        }
      }
    }
  };

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
  
  // Supabaseストレージバケットの確認
  useEffect(() => {
    if (user) {
      checkStorageBucket();
    }
  }, [user]);
  
  // 認証関連のセットアップと管理を改善
  useEffect(() => {
    // 認証リスナーをセットアップ - セッションが変更された時に対応
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('認証状態変化イベント:', event);
        
        // セッション状態の変化をログ（デバッグ用）
        if (session) {
          console.log('有効なセッションを検出:', session.user?.id);
          // 明示的にセッションを保存
          try {
            localStorage.setItem('sb-bsgvaomswzkywbiubtjg-auth-token', JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }));
            console.log('セッションをローカルストレージに保存しました');
          } catch (e) {
            console.error('セッション保存エラー:', e);
          }
        } else {
          console.log('セッションなし');
        }

        // 必要に応じて状態を更新
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // プロファイル情報を再取得
          try {
            const { data, error } = await supabaseClient
              .from('profiles')
              .select('*')
              .eq('id', session?.user?.id)
              .single();
            
            if (!error && data) {
              console.log('プロファイル情報を更新しました');
            }
          } catch (error) {
            console.error('プロファイル取得エラー:', error);
          }
        }
      }
    );

    // ページロード時の初期セッション確認
    setTimeout(async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
          console.error('セッション取得エラー:', error);
          // セッション取得エラーの場合、再ログインを促す
          toast({
            title: '認証エラー',
            description: 'セッションが無効です。再ログインしてください。',
            variant: 'destructive',
            duration: 10000,
          });
          return;
        }

        if (data.session) {
          console.log('初期セッション確認完了:', data.session.user?.id);
          // 明示的にセッションを保存
          try {
            localStorage.setItem('sb-bsgvaomswzkywbiubtjg-auth-token', JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }));
            console.log('初期セッションをローカルストレージに保存しました');
          } catch (e) {
            console.error('セッション保存エラー:', e);
          }
        } else {
          console.log('初期セッションなし');
          // セッションがない場合、再ログインを促す
          toast({
            title: '認証エラー',
            description: 'ログインセッションが見つかりません。再ログインしてください。',
            variant: 'destructive',
            duration: 10000,
          });
        }
      } catch (e) {
        console.error('セッション確認エラー:', e);
      }
    }, 100); // 少し遅延させる

    // クリーンアップ関数
    return () => {
      subscription?.unsubscribe();
    };
  }, [toast]);

  // ストレージバケットの存在確認の関数を修正
  const checkStorageBucket = async () => {
    console.log("ストレージバケット確認を開始");
    try {
      // セッション状態を確認 - 非同期で処理
      const { data, error } = await supabaseClient.auth.getSession();
      
      if (error) {
        console.error('認証セッション取得エラー:', error);
        return false;
      }
      
      if (!data.session) {
        console.log('認証セッションがありません');
        return false;
      }
      
      // バケット一覧を取得
      const { data: buckets, error: bucketsError } = await supabaseClient
        .storage
        .listBuckets();
      
      if (bucketsError) {
        console.error('バケット一覧取得エラー:', bucketsError);
        // バケット一覧取得エラーがあっても、minutesaudioバケットが存在する可能性があるので
        // 直接minutesaudioバケットへのアクセスを試みる
        try {
          const { data: files, error: filesError } = await supabaseClient
            .storage
            .from('minutesaudio')
            .list('meeting_recordings');
            
          if (!filesError) {
            console.log('minutesaudioバケットへの直接アクセス成功:', files);
            return true;
          } else {
            console.error('minutesaudioバケットへの直接アクセスエラー:', filesError);
          }
        } catch (directAccessError) {
          console.error('直接アクセス試行エラー:', directAccessError);
        }
        
        toast({
          title: '警告',
          description: 'ストレージへのアクセス権限に問題がありますが、処理は続行します。',
          duration: 5000,
        });
        return false;
      }
      
      console.log('利用可能なバケット一覧:', buckets);
      
      // バケットリストが空でも、minutesaudioバケットへの直接アクセスを試みる
      if (!buckets || buckets.length === 0) {
        try {
          const { data: files, error: filesError } = await supabaseClient
            .storage
            .from('minutesaudio')
            .list('meeting_recordings');
            
          if (!filesError) {
            console.log('空のバケットリストだがminutesaudioバケットへのアクセス成功:', files);
            return true;
          }
        } catch (directAccessError) {
          console.error('直接アクセス試行エラー:', directAccessError);
        }
        
        toast({
          title: '情報',
          description: 'バケットリストの取得に問題がありますが、処理は続行します。',
          duration: 5000,
        });
      }
      
      return true;
    } catch (error) {
      console.error('ストレージバケット確認エラー:', error);
      return false;
    }
  };

  // 認証セッションを定期的に監視するためのリスナー
  useEffect(() => {
    // 認証リスナーをセットアップ - セッションが変更された時に対応
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('認証状態変化イベント:', event);
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('認証トークンが更新されました');
          await checkStorageBucket(); // ストレージバケットを再確認
        }
      }
    );
    
    // コンポーネントがマウントされたらバケットをチェック
    checkStorageBucket();
    
    // クリーンアップ関数
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 録音開始
  const startRecording = async () => {
    try {
      // すでにファイルが選択されている場合はクリア
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      
      // ストレージに保存済みの場合は削除
      if (audioFilePath) {
        try {
          const { error } = await supabaseClient.storage
            .from('minutesaudio')
            .remove([audioFilePath]);
            
          if (error) {
            console.error('音声ファイルの削除エラー:', error);
          }
        } catch (error) {
          console.error('音声ファイル削除中のエラー:', error);
        }
        
        setAudioFilePath(null);
      }
      
      // 音声APIが利用可能か確認
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('お使いのブラウザは音声録音をサポートしていません');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // データ取得時のエラーハンドリング追加
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder エラー:', event);
        toast({
          title: 'エラー',
          description: '録音中にエラーが発生しました',
          variant: 'destructive',
        });
        setIsRecording(false);
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        try {
          // 録音データの準備
          if (audioChunksRef.current.length === 0) {
            throw new Error('録音データが取得できませんでした');
          }
          
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          // この時点でのrecordingTimeを使用
          const currentDuration = recordingTime;
          
          console.log('MediaRecorder onstop - 録音時間:', currentDuration);
          
          // 音声の再生用URL作成
          try {
            const newAudioUrl = URL.createObjectURL(audioBlob);
            setAudioUrl(newAudioUrl);
          } catch (urlError) {
            console.error('音声URL作成エラー:', urlError);
          }
          
          setAudioRecording({
            audioBlob,
            duration: currentDuration,
            filename: `meeting_recording_${new Date().getTime()}.wav`
          });
          
          toast({
            title: '録音完了',
            description: `録音時間: ${formatTime(currentDuration)}`,
          });
        } catch (error) {
          console.error('録音処理エラー:', error);
          toast({
            title: 'エラー',
            description: error instanceof Error ? error.message : '録音処理中にエラーが発生しました',
            variant: 'destructive',
          });
        } finally {
          // ストリームのトラックを停止
          stream.getTracks().forEach(track => track.stop());
        }
      };

      // 録音開始
      try {
        mediaRecorder.start();
        setIsRecording(true);
        setRecordingTime(0);
        setAudioRecording(null);
        
        toast({
          title: '録音開始',
          description: '会議の録音を開始しました',
        });
      } catch (startError) {
        console.error('録音開始エラー:', startError);
        throw new Error('録音の開始に失敗しました');
      }
    } catch (error) {
      console.error('録音の開始に失敗しました:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : '録音の開始に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // 録音停止
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // 現在の録音時間を保存
      const finalRecordingTime = recordingTime;
      console.log('録音停止時の録音時間を保存:', finalRecordingTime);
      
      // 停止前に録音時間を変数に保存しておく
      const savedTime = recordingTime;
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // onstopイベントが発火する前に直接設定しておく
      setTimeout(() => {
        if (!audioRecording) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const newAudioUrl = URL.createObjectURL(audioBlob);
          setAudioUrl(newAudioUrl);
          
          setAudioRecording({
            audioBlob,
            duration: savedTime, // 保存しておいた時間を使用
            filename: `meeting_recording_${new Date().getTime()}.wav`
          });
          
          console.log('録音データを設定しました - 録音時間:', savedTime);
        }
      }, 200);
      
      toast({
        title: '録音停止',
        description: `会議の録音を停止しました (${formatTime(finalRecordingTime)})`,
      });
      
      console.log('録音停止 - 録音時間:', finalRecordingTime);
    }
  };

  // ストレージバケットの存在確認と作成
  // この関数を削除または置き換え
  const ensureStoragePath = async () => {
    try {
      // minutesaudioバケットの会議録音フォルダをチェック
      // 実際にはこのパスにファイルを置くだけでOK（Supabaseは自動的に必要なパスを作成）
      if (profile?.facility_id) {
        const { data, error } = await supabaseClient.storage.from('minutesaudio')
          .list(`meeting_recordings/${profile.facility_id}`);
          
        console.log('ストレージパスチェック結果:', { data, error });
      }
      
      return true;
    } catch (error) {
      console.error('ストレージパスチェックエラー:', error);
      return false;
    }
  };

  // ストレージから録音ファイルを取得する関数
  const fetchAudioFromStorage = async (filePath: string) => {
    try {
      console.log(`ストレージからオーディオ取得開始: ${filePath}`);
      
      // 公開URLを作成
      const { data, error } = await supabaseClient.storage
        .from('minutesaudio')
        .createSignedUrl(filePath, 60 * 60); // 1時間有効なURL
      
      if (error) {
        console.error('署名付きURL作成エラー:', error);
        return null;
      }
      
      if (!data || !data.signedUrl) {
        console.error('署名付きURLが取得できませんでした');
        return null;
      }
      
      console.log('署名付きURL取得成功:', data.signedUrl);
      
      // 署名付きURLを設定
      setAudioUrl(data.signedUrl);
      return data.signedUrl;
    } catch (error) {
      console.error('オーディオファイル取得エラー:', error);
      return null;
    }
  };

  // 音声ファイルをストレージにアップロードする関数を修正
  const saveAudioToStorage = async (forceNew = false): Promise<string | null> => {
    // 既に保存済みで、強制上書きでなければ既存のパスを返す
    if (audioFilePath && !forceNew) {
      console.log('既に保存済みの音声ファイルを使用します:', audioFilePath);
      return audioFilePath;
    }

    if (!audioRecording || !audioRecording.audioBlob) {
      console.error('音声データがありません');
      toast({
        title: 'エラー',
        description: '音声データが見つかりません。',
        variant: 'destructive',
        duration: 5000,
      });
      return null;
    }
    
    if (!profile?.facility_id) {
      console.error('施設IDが取得できません');
      toast({
        title: 'エラー',
        description: '施設情報が取得できません。ログイン状態を確認してください。',
        variant: 'destructive',
        duration: 5000,
      });
      return null;
    }
    
    try {
      // ファイル保存処理中フラグを設定
      setIsUploading(true);
      
      // 一意のファイル名を生成（施設IDを含める）
      const facilityId = profile.facility_id;
      const timestamp = Date.now();
      const fileName = `meeting_recordings/${facilityId}/${timestamp}.wav`;
      console.log('アップロードファイル名:', fileName);
      
      // タイムアウト処理を追加
      const uploadPromise = new Promise<{ path?: string, error?: any }>(async (resolve) => {
        try {
          // 直接minutesaudioバケットへのアップロード
          console.log('minutesaudioバケットに直接アップロードを試みます');
          const { data: fileData, error } = await supabaseClient.storage
            .from('minutesaudio')
            .upload(fileName, audioRecording.audioBlob, {
              contentType: 'audio/wav',
              cacheControl: '3600'
            });
          
          resolve({ path: fileData?.path, error });
        } catch (error) {
          resolve({ error });
        }
      });
      
      // タイムアウト処理
      const timeoutPromise = new Promise<{ path?: string, error?: any }>((resolve) => {
        setTimeout(() => {
          resolve({ 
            error: new Error('アップロードがタイムアウトしました。処理を続行します。') 
          });
        }, 20000); // 20秒後にタイムアウト
      });
      
      // どちらか早い方の結果を採用
      const { path, error } = await Promise.race([uploadPromise, timeoutPromise]);
      
      if (error) {
        // 認証エラーを特別に処理
        if (error.message && error.message.includes('Authentication')) {
          console.error('認証エラー:', error);
          toast({
            title: '認証エラー',
            description: '認証に失敗しました。再ログインしてください。',
            variant: 'destructive',
            duration: 10000,
          });
          return null;
        }
        
        // タイムアウトの場合は警告を表示して続行
        if (error.message && error.message.includes('タイムアウト')) {
          console.warn(error.message);
          toast({
            title: '警告',
            description: 'アップロードに時間がかかっていますが、処理を続行します。',
            variant: 'default',
            duration: 5000,
          });
          // 保存パスをとりあえず設定して続行する
          setAudioFilePath(fileName);
          return fileName;
        }
        
        console.error('音声アップロードエラー:', error);
        toast({
          title: 'エラー',
          description: `音声ファイルのアップロードに失敗しました: ${error.message}`,
          variant: 'destructive',
          duration: 5000,
        });
        return null;
      }
      
      // 保存したパスを状態として保存
      const savedPath = path || fileName;
      setAudioFilePath(savedPath);
      
      console.log('音声ファイルをアップロードしました:', savedPath);
      
      return savedPath;
    } catch (error) {
      console.error('音声保存エラー:', error);
      toast({
        title: '警告',
        description: error instanceof Error ? error.message : '音声ファイルをストレージに保存できませんでした。',
        variant: 'destructive',
        duration: 5000,
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // 録音削除
  const deleteRecording = async () => {
    // オーディオURLのリリース
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    // ストレージに保存済みの場合は削除
    if (audioFilePath) {
      try {
        const { error } = await supabaseClient.storage
          .from('minutesaudio')  // バケット名をminutesaudioに統一
          .remove([audioFilePath]);
          
        if (error) {
          console.error('音声ファイルの削除エラー:', error);
        }
      } catch (error) {
        console.error('音声ファイル削除中のエラー:', error);
      }
      
      setAudioFilePath(null);
    }
    
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

  // 文字起こし処理を録音保存も含めて行う形に修正
  const processAudio = async () => {
    if (!audioRecording) return;
    
    setIsProcessing(true);
    
    try {
      // ブラウザ内の音声データを優先して使用
      const audioSource = audioRecording.audioBlob;
      let sourceType = 'ブラウザ内音声データ';
      
      // 保存済みのファイルパスがある場合は記録
      if (audioFilePath) {
        console.log('保存済みの音声ファイルパス:', audioFilePath);
        sourceType = '保存済み音声ファイル';
      }
      
      console.log(`音声処理を開始: ${sourceType}`);
      
      // 音声URLがない場合はローカルで作成
      if (!audioUrl && audioSource) {
        const newAudioUrl = URL.createObjectURL(audioSource);
        setAudioUrl(newAudioUrl);
        console.log('ローカルで音声URLを作成しました');
      }
      
      // 音声ファイルサイズの確認
      const fileSizeMB = audioSource.size / (1024 * 1024);
      console.log(`録音情報 - ファイルサイズ: ${fileSizeMB.toFixed(2)} MB, 録音時間: ${formatTime(audioRecording.duration)}`);
      
      // 処理中メッセージを表示
      toast({
        title: '処理中',
        description: '音声データを保存し、会議議事録を作成しています。文字起こしは非同期で処理されます。',
        duration: 5000,
      });
      
      // トランスクリプトテキストを設定（非同期処理のため仮テキスト）
      setTranscriptionText('（文字起こし処理中...）');
      setTranscriptSegments([{
        speakerId: '1',
        text: '文字起こし処理中です。保存後、一覧画面から詳細を確認すると文字起こし結果が表示されます。'
      }]);
      
      // 空の要約を設定
      setSummary('（要約処理中...）');
      
      // キーワードの初期値
      if (keywords.length === 0) {
        setKeywords(['会議', '議事録']);
      }
      
      // 音声ファイルを保存（まだ保存されていない場合）- タイムアウト付き
      let savedPath = audioFilePath;
      if (!savedPath) {
        try {
          console.log('音声ファイルのアップロードを開始');
          
          // タイムアウト付きで保存処理
          const uploadPromise = saveAudioToStorage(true);
          const timeoutPromise = new Promise<string | null>((resolve) => {
            setTimeout(() => {
              console.log('アップロード待機時間が長すぎます。ファイル名だけ設定して処理を続行します。');
              const tempFileName = `meeting_recordings/${profile?.facility_id}/${Date.now()}.wav`;
              setAudioFilePath(tempFileName);
              resolve(tempFileName);
            }, 10000); // 10秒でタイムアウト
          });
          
          savedPath = await Promise.race([uploadPromise, timeoutPromise]);
          
          if (savedPath) {
            console.log('音声ファイルの保存に成功しました:', savedPath);
          } else {
            console.log('音声ファイルの保存に失敗しましたが、処理を続行します');
            // 一時的なパスを設定して続行
            const tempFileName = `meeting_recordings/${profile?.facility_id}/${Date.now()}.wav`;
            setAudioFilePath(tempFileName);
            savedPath = tempFileName;
            
            toast({
              title: '警告',
              description: '音声ファイルの保存に失敗しました。テキストデータのみで保存します。',
              variant: 'destructive',
              duration: 5000,
            });
          }
        } catch (uploadError) {
          console.error('音声アップロードエラー:', uploadError);
          toast({
            title: '警告',
            description: '音声ファイルのアップロードに失敗しました。テキストデータのみで保存します。',
            variant: 'destructive',
            duration: 5000,
          });
          
          // エラーでも続行できるように一時的なパスを設定
          const tempFileName = `meeting_recordings/${profile?.facility_id}/${Date.now()}.wav`;
          setAudioFilePath(tempFileName);
          savedPath = tempFileName;
        }
      } else {
        console.log('既存の保存済み音声ファイルを使用します:', savedPath);
      }
      
      // 次のステップに進む
      setCurrentStep('transcript');
      
      // 会議議事録の保存（transcription_status を 'processing' に設定）
      console.log('会議議事録の保存を開始します');
      const meetingMinuteData = {
        title,
        meeting_type_id: meetingTypeId,
        meeting_date: meetingDate,
        recorded_by: user?.id,
        facility_id: profile?.facility_id,
        attendees: attendees.split(',').map(a => a.trim()).filter(Boolean),
        content: '（文字起こし処理中）',
        summary: '（要約処理中）',
        keywords: keywords.length > 0 ? keywords : ['会議', '議事録'],
        audio_file_path: savedPath,
        is_transcribed: false,
        transcription_status: 'processing' as const,
        speakers: JSON.stringify(speakers),
        segments: JSON.stringify(transcriptSegments)
      };
      
      const savedMeetingMinute = await saveMeetingMinute(meetingMinuteData);
      
      // 保存に成功した場合、バックグラウンドで文字起こし処理を開始
      if (savedMeetingMinute && savedPath) {
        console.log('バックグラウンドでの文字起こし処理を開始します');
        processAudioBackground(savedPath, savedMeetingMinute.id);
      } else {
        console.error('会議議事録の保存に失敗しました。バックグラウンド処理は実行されません。');
        // 保存失敗の通知
        toast({
          title: 'エラー',
          description: '会議議事録の保存に失敗しました。再度お試しください。',
          variant: 'destructive',
          duration: 5000,
        });
      }
      
    } catch (error) {
      console.error('音声処理エラー:', error);
      
      let errorMessage = '音声の処理中にエラーが発生しました';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'エラー',
        description: errorMessage,
        variant: 'destructive',
        duration: 10000,
      });
      
      // エラーが発生しても保存を試みる
      try {
        setCurrentStep('transcript');
        await saveMeetingMinute();
      } catch (saveError) {
        console.error('エラー後の保存も失敗:', saveError);
      }
    } finally {
      setIsProcessing(false);
      console.log('処理完了 - isProcessing状態をfalseに設定');
      
      // 一覧画面に遷移
      toast({
        title: '処理完了',
        description: '議事録を保存しました。文字起こしは非同期で処理されます。',
        duration: 3000,
      });
      
      setTimeout(() => {
        router.push('/meeting-minutes');
      }, 2000);
    }
  };

  // バックグラウンドでの文字起こし処理を行う関数
  const processAudioBackground = async (audioFilePath: string, meetingMinuteId: string) => {
    try {
      console.log(`バックグラウンド処理: ${audioFilePath} の文字起こしを開始`);
      
      // 音声ファイルをストレージから取得
      const audioUrl = await fetchAudioFromStorage(audioFilePath);
      if (!audioUrl) {
        console.error('音声ファイルの取得に失敗しました');
        return;
      }
      
      // 音声ファイルをBlobとして取得
      const response = await fetch(audioUrl);
      const audioBlob = await response.blob();
      
      // 音声ファイルをFileオブジェクトに変換
      const audioFile = new File(
        [audioBlob],
        `meeting_recording_${Date.now()}.wav`,
        { type: 'audio/wav' }
      );
      
      console.log(`文字起こし処理開始: ${audioFile.name}, サイズ: ${(audioFile.size / (1024 * 1024)).toFixed(2)}MB`);
      
      // OpenAI APIを使用して文字起こし
      const transcriptionResult = await transcribeAudio(audioFile);
      console.log('文字起こし完了:', transcriptionResult.substring(0, 100) + '...');
      
      // 文字起こし結果を話者ごとに分割
      const segments = convertTextToSegments(transcriptionResult);
      
      // 要約とキーワード抽出
      console.log('要約処理を開始します');
      const summarizationResult = await summarizeText(transcriptionResult);
      console.log('要約処理完了');
      
      // データベースを更新
      const { error } = await supabaseClient
        .from('meeting_minutes')
        .update({
          content: transcriptionResult,
          summary: summarizationResult.summary,
          keywords: summarizationResult.keywords,
          is_transcribed: true,
          segments: JSON.stringify(segments)
        })
        .eq('id', meetingMinuteId);
      
      if (error) {
        console.error('データベース更新エラー:', error);
        return;
      }
      
      console.log(`会議議事録ID ${meetingMinuteId} の文字起こしと要約を更新しました`);
      
    } catch (error) {
      console.error('バックグラウンド処理エラー:', error);
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

  // 会議議事録を保存する関数を修正
  const saveMeetingMinute = async (customData?: any) => {
    console.log('saveMeetingMinute開始');
    
    // バリデーション
    if (!title) {
      toast({
        title: 'エラー',
        description: 'タイトルを入力してください',
        variant: 'destructive',
        duration: 5000,
      });
      return null;
    }
    
    if (!meetingTypeId) {
      toast({
        title: 'エラー',
        description: '会議種類を選択してください',
        variant: 'destructive', 
        duration: 5000,
      });
      return null;
    }

    // ユーザー認証チェック
    if (!user) {
      toast({
        title: 'エラー',
        description: '認証情報が取得できません。再ログインしてください。',
        variant: 'destructive',
        duration: 5000,
      });
      return null;
    }
    
    setIsLoading(true);
    
    // 保存中の通知
    toast({
      title: '保存中',
      description: '会議議事録を保存しています...',
      duration: 3000,
    });
    
    try {
      // 音声ファイルのアップロード（未保存の場合のみ）
      let finalAudioFilePath = audioFilePath;
      if (!finalAudioFilePath && audioRecording && !isUploading) {
        try {
          console.log('音声ファイルのアップロードを開始');
          finalAudioFilePath = await saveAudioToStorage();
          if (finalAudioFilePath) {
            console.log('最終保存時に音声ファイルをアップロードしました:', finalAudioFilePath);
          } else {
            console.log('音声ファイルのストレージ保存はスキップされました');
          }
        } catch (uploadError) {
          console.error('音声アップロードエラー:', uploadError);
          // アップロードに失敗しても会議録の保存は続行
          toast({
            title: '警告',
            description: '音声ファイルのアップロードに失敗しましたが、テキストデータは保存されます',
            variant: 'destructive',
            duration: 5000,
          });
        }
      } else if (finalAudioFilePath) {
        console.log('既存の音声ファイルを使用します:', finalAudioFilePath);
      }
      
      // 音声ファイルパスがmeeting_recordingsディレクトリを含んでいることを確認
      if (finalAudioFilePath) {
        if (!finalAudioFilePath.startsWith('meeting_recordings/')) {
          finalAudioFilePath = `meeting_recordings/${finalAudioFilePath}`;
        }
        console.log('最終的な音声ファイルパス:', finalAudioFilePath);
      } else {
        console.log('音声ファイルなしで会議録を保存します');
      }
      
      // 参加者の処理
      const attendeesList = attendees
        .split(',')
        .map(name => name.trim())
        .filter(name => name);
      
      // 話者情報とセグメント情報をJSON化
      const speakersData = JSON.stringify(speakers);
      const segmentsData = JSON.stringify(transcriptSegments);
      
      // 全テキスト結合（話者名付き）- 文字起こしがない場合は空
      const fullText = transcriptSegments.length > 0 
        ? transcriptSegments
            .map(segment => {
              const speaker = speakers.find(s => s.id === segment.speakerId) || speakers[0];
              return `${speaker.name}：${segment.text}`;
            })
            .join('\n\n')
        : '（文字起こし処理中）';
      
      // ユーザー名を取得（プロファイルまたはメールアドレスから）
      const userName = profile?.full_name || (user.email ? user.email.split('@')[0] : '不明なユーザー');
      
      console.log('会議議事録の保存 - 作成者情報:', {
        id: user.id,
        email: user.email,
        name: userName
      });
      
      // 会議議事録の保存用データを作成 - テーブルスキーマに合わせる
      const meetingMinuteData = customData || {
        title,
        meeting_type_id: meetingTypeId,
        meeting_date: meetingDate,
        recorded_by: user.id,
        facility_id: profile?.facility_id,
        attendees: attendeesList,
        content: fullText,
        summary: summary || '（要約処理中）',
        keywords: keywords.length > 0 ? keywords : ['会議', '議事録'],
        audio_file_path: finalAudioFilePath,
        is_transcribed: !!transcriptionText,
        transcription_status: 'waiting' as const,
        speakers: speakersData,
        segments: segmentsData
      };
      
      console.log('保存するデータ:', meetingMinuteData);
      
      // APIでの保存を先に試みる
      try {
        console.log('API経由での保存を開始');
        const response = await fetch('/api/meeting-minutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user?.id || ''}`,
          },
          body: JSON.stringify(meetingMinuteData),
        });
        
        if (response.ok) {
          const apiResult = await response.json();
          console.log('API保存結果:', apiResult);
          
          // API経由での保存が成功した場合
          console.log('API経由での保存が成功しました');
          
          // 成功通知
          toast({
            title: '保存完了',
            description: '会議議事録を保存しました。文字起こしは非同期で処理されます。',
            duration: 5000,
          });
          
          // 成功フラグを設定
          setSaveSuccess(true);
          
          // 一覧画面に戻る
          setTimeout(() => {
            console.log('一覧画面に遷移します (API保存成功時)');
            router.push('/meeting-minutes');
          }, 2000);
          
          return apiResult;
        } else {
          console.error('API経由での保存に失敗しました:', await response.text());
        }
      } catch (apiError) {
        console.error('API呼び出しエラー:', apiError);
      }
      
      // API呼び出しが失敗した場合はSupabaseクライアントで直接保存を試みる
      try {
        console.log('Supabase直接保存を開始');
        // 会議議事録の保存
        const { data, error } = await supabaseClient
          .from('meeting_minutes')
          .insert(meetingMinuteData)
          .select();
          
        if (error) {
          console.error('会議議事録の保存エラー詳細:', error);
          
          // エラーの種類に応じたメッセージ
          let errorMessage = '会議議事録の保存に失敗しました';
          
          // カラム不一致エラーの場合
          if (error.message && error.message.includes('column')) {
            console.log('スキーマ不一致エラー、問題を分析します:', error.message);
            
            if (error.message.includes('creator_info')) {
              // creator_info 関連のエラー
              errorMessage = 'データベーススキーマに creator_info フィールドがありません';
              
              // フィールドを削除して再試行（delete演算子を使わずに新しいオブジェクトを作成）
              const simplifiedData = createSimplifiedMeetingData(meetingMinuteData);
              console.log('簡略化したデータで再試行:', simplifiedData);
              
              // 再試行
              const { data: retryData, error: retryError } = await supabaseClient
                .from('meeting_minutes')
                .insert(simplifiedData)
                .select();
                
              if (!retryError) {
                console.log('簡略化したデータで保存に成功しました');
                
                // 成功通知
                toast({
                  title: '保存完了',
                  description: '会議議事録を保存しました（簡易版）。文字起こしは非同期で処理されます。',
                  duration: 5000,
                });
                
                // 成功フラグを設定
                setSaveSuccess(true);
                
                // 一覧画面に戻る
                setTimeout(() => {
                  console.log('一覧画面に遷移します (簡易保存成功時)');
                  router.push('/meeting-minutes');
                }, 2000);
                
                return retryData?.[0] || null;
              }
              
              console.error('再試行も失敗しました:', retryError);
            } else {
              errorMessage = `データベーススキーマエラー: ${error.message}`;
            }
          } 
          // 外部キー制約エラーの場合
          else if (error.message && error.message.includes('foreign key constraint')) {
            errorMessage = '関連データに問題があります。選択した会議種類が正しいか確認してください。';
          }
          // 認証エラーの場合
          else if (error.message && error.message.includes('auth')) {
            errorMessage = '認証エラーが発生しました。再ログインしてください。';
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
          description: '会議議事録を保存しました。文字起こしは非同期で処理されます。',
          duration: 5000,
        });
        
        // 成功フラグを設定
        setSaveSuccess(true);
        
        // 一覧画面に戻る
        setTimeout(() => {
          console.log('一覧画面に遷移します (Supabase保存成功時)');
          router.push('/meeting-minutes');
        }, 2000);
        
        return data?.[0] || null;
      } catch (dbError) {
        console.error('Supabase保存エラー:', dbError);
        throw dbError;
      }
    } catch (error: any) {
      console.error('会議議事録の保存エラー:', error);
      
      // エラーメッセージを表示
      toast({
        title: 'エラー',
        description: error.message || '会議議事録の保存に失敗しました',
        variant: 'destructive',
        duration: 10000,
      });
      
      // スクロールして保存ボタンが見えるようにする
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
      
      return null;
    } finally {
      setIsLoading(false);
      console.log('saveMeetingMinute完了 - isLoading状態をfalseに設定');
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
  const nextStep = async () => {
    if (currentStep === 'info') {
      setCurrentStep('record');
    } else if (currentStep === 'record' && audioRecording) {
      // 録音ステップから次へ進む前に音声ファイルを保存
      try {
        // まだ音声URLがない場合は作成
        if (!audioUrl && audioRecording) {
          const newAudioUrl = URL.createObjectURL(audioRecording.audioBlob);
          setAudioUrl(newAudioUrl);
          console.log('ローカルで音声URLを作成しました');
        }
        
        // ファイルが未保存の場合のみストレージへアップロード
        if (!audioFilePath && audioRecording && !isUploading) {
          try {
            // isUploading フラグは saveAudioToStorage 内部で管理
            const savedPath = await saveAudioToStorage();
            if (savedPath) {
              console.log('音声ファイルを保存しました:', savedPath);
              
              toast({
                title: '保存完了',
                description: '音声ファイルを保存しました。「議事録作成」ボタンをクリックすると文字起こしを開始します。',
                duration: 5000,
              });
            } else {
              console.log('音声ファイルの保存はスキップされました');
              toast({
                title: '情報',
                description: '音声データはローカルのみで利用されます。処理を続行します。',
                duration: 5000,
              });
            }
          } catch (saveError) {
            console.error('保存エラーが発生しましたが、続行します:', saveError);
            toast({
              title: '警告',
              description: '音声ファイルの保存に失敗しましたが、議事録作成は続行できます',
              variant: 'destructive',
              duration: 5000,
            });
          }
        }
        
        // 次のステップへ
        setCurrentStep('transcript');
      } catch (error) {
        console.error('次のステップへの移行エラー:', error);
        toast({
          title: 'エラー',
          description: '処理中にエラーが発生しました。もう一度お試しください。',
          variant: 'destructive',
          duration: 5000,
        });
      }
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

  // 録音データを再生するための関数
  const playAudio = () => {
    if (!audioUrl && audioRecording) {
      // URLがなくてもBlobがある場合は、URLを作成
      const newAudioUrl = URL.createObjectURL(audioRecording.audioBlob);
      setAudioUrl(newAudioUrl);
    }
    
    if (!audioUrl) {
      toast({
        title: 'エラー',
        description: '再生できる音声データがありません',
        variant: 'destructive',
      });
      return;
    }
    
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      if (audioRef.current) {
        audioRef.current.play().catch(error => {
          console.error('音声再生エラー:', error);
          toast({
            title: 'エラー',
            description: '音声の再生に失敗しました: ' + (error.message || '不明なエラー'),
            variant: 'destructive',
          });
        });
        setIsPlaying(true);
      }
    }
  };

  // オーディオ再生終了時の処理
  useEffect(() => {
    const handleEnded = () => {
      setIsPlaying(false);
    };
    
    if (audioRef.current) {
      audioRef.current.addEventListener('ended', handleEnded);
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleEnded);
      }
    };
  }, [audioRef.current]);

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
                    onChange={handleMeetingDateChange}
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
                      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                        <div className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full animate-pulse">
                          録音中...
                        </div>
                      </div>
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
                          <span className="text-xs text-gray-400">
                            ({audioRecording ? (audioRecording.audioBlob.size / (1024 * 1024)).toFixed(2) : 0} MB)
                          </span>
                        </div>
                      </div>
                      
                      <Waveform isRecording={false} />
                      
                      <div className="flex justify-center space-x-4 mt-4">
                        <Button
                          variant="outline"
                          onClick={deleteRecording}
                          disabled={isLoading || isUploading}
                          className="rounded-xl px-6 py-2 text-sm border-red-200 text-red-600 hover:bg-red-50 w-full"
                        >
                          <Trash className="mr-2 h-4 w-4" /> 削除
                        </Button>
                      </div>

                      {/* 録音完了後の音声プレイヤー */}
                      <div className="flex justify-center w-full mt-4">
                        <audio ref={audioRef} className="hidden" src={audioUrl || undefined} />
                        
                        <Button
                          variant="outline"
                          onClick={playAudio}
                          disabled={!audioUrl}
                          className="rounded-xl px-6 py-2 text-sm border-blue-200 text-blue-600 hover:bg-blue-50 w-full"
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="mr-2 h-4 w-4" /> 一時停止
                            </>
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4" /> 再生
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* 録音保存ボタンを議事録作成ボタンに変更 */}
                      <div className="flex justify-center w-full mt-4">
                        <Button
                          variant="outline"
                          onClick={processAudio}
                          disabled={isUploading || isProcessing}
                          className="rounded-xl px-6 py-2 text-sm border-green-200 text-green-600 hover:bg-green-50 w-full"
                        >
                          {isUploading || isProcessing ? (
                            <>
                              <div className="animate-spin h-4 w-4 mr-2 border-2 border-green-600 border-t-transparent rounded-full" />
                              処理中...
                            </>
                          ) : (
                            <>
                              <FileText className="mr-2 h-4 w-4" /> 議事録作成
                            </>
                          )}
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
              
              {audioRecording && !isProcessing && (
                <Button
                  onClick={processAudio}
                  disabled={isUploading || isProcessing}
                  className="rounded-xl h-14 text-base bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-white border-t-transparent rounded-full" />
                      処理中...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-5 w-5" /> 議事録作成
                    </>
                  )}
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

// 大きな音声ファイルを分割する関数
const splitAudioFile = async (audioBlob: Blob, maxChunkSizeMB = 20): Promise<Blob[]> => {
  const fileSizeMB = audioBlob.size / (1024 * 1024);
  
  // ファイルサイズが指定サイズ以下なら分割しない
  if (fileSizeMB <= maxChunkSizeMB) {
    return [audioBlob];
  }
  
  console.log(`大きな音声ファイル(${fileSizeMB.toFixed(2)}MB)を分割します`);
  
  // AudioContext を使用して音声を処理
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // ArrayBuffer に変換
  const arrayBuffer = await audioBlob.arrayBuffer();
  
  // オーディオデータをデコード
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  
  // 分割数を計算（切り上げ）
  const numberOfChunks = Math.ceil(fileSizeMB / maxChunkSizeMB);
  const chunkDuration = duration / numberOfChunks;
  
  console.log(`音声を${numberOfChunks}個のチャンクに分割します。各チャンク長：約${chunkDuration.toFixed(1)}秒`);
  
  const chunks: Blob[] = [];
  
  for (let i = 0; i < numberOfChunks; i++) {
    // 各チャンクの開始時間と終了時間を計算
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, duration);
    const chunkFrames = (endTime - startTime) * sampleRate;
    
    // 新しいバッファを作成
    const chunkBuffer = audioContext.createBuffer(
      numberOfChannels, 
      chunkFrames, 
      sampleRate
    );
    
    // 元のバッファからデータをコピー
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      const chunkChannelData = chunkBuffer.getChannelData(channel);
      
      const startFrame = Math.floor(startTime * sampleRate);
      for (let frame = 0; frame < chunkFrames; frame++) {
        chunkChannelData[frame] = channelData[startFrame + frame];
      }
    }
    
    // OfflineAudioContext を使用してバッファをエンコード
    const offlineAudioContext = new OfflineAudioContext(
      numberOfChannels,
      chunkFrames,
      sampleRate
    );
    
    const source = offlineAudioContext.createBufferSource();
    source.buffer = chunkBuffer;
    source.connect(offlineAudioContext.destination);
    source.start();
    
    const renderedBuffer = await offlineAudioContext.startRendering();
    
    // WAVエンコーディング（簡易版）
    const wavBlob = await encodeWAV(renderedBuffer);
    chunks.push(wavBlob);
    
    console.log(`チャンク ${i+1}/${numberOfChunks} を作成（${(wavBlob.size / (1024 * 1024)).toFixed(2)}MB）`);
  }
  
  return chunks;
};

// WAVエンコーディング関数（簡易版）
const encodeWAV = async (audioBuffer: AudioBuffer): Promise<Blob> => {
  return new Promise((resolve) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2;
    
    // WAVヘッダの作成
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // "RIFF" チャンク記述子
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    
    // "fmt " サブチャンク
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);  // PCM形式
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    
    // "data" サブチャンク
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    
    // オーディオデータの書き込み
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, value, true);
        offset += 2;
      }
    }
    
    resolve(new Blob([buffer], { type: 'audio/wav' }));
  });
};

// WAVヘッダー用のヘルパー関数
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// 保存時にdelete演算子でリンターエラーが出る問題を修正するためのヘルパー関数
const createSimplifiedMeetingData = (originalData: any): any => {
  // 必要なフィールドだけを新しいオブジェクトにコピー
  // speakersとsegmentsフィールドは除外
  const {
    title,
    meeting_type_id,
    meeting_date,
    recorded_by,
    facility_id,
    attendees,
    content,
    summary,
    keywords,
    audio_file_path,
    is_transcribed
  } = originalData;
  
  return {
    title,
    meeting_type_id,
    meeting_date,
    recorded_by,
    facility_id,
    attendees,
    content,
    summary,
    keywords,
    audio_file_path,
    is_transcribed
  };
};