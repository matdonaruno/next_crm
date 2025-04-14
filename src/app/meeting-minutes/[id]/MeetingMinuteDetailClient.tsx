'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { 
  Calendar, 
  Users, 
  Tag, 
  Edit2, 
  ArrowLeft, 
  Send, 
  Download,
  Play,
  Pause,
  RefreshCw,
  Save,
  X,
  Mic,
  UserCircle,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Maximize,
  Settings,
  MessageSquare,
  Loader,
  Check,
  FileText
} from 'lucide-react';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useFacility } from '@/hooks/use-facility';
import { useAuth } from '@/hooks/use-auth';
import { MeetingMinute } from '@/types/meeting-minutes';
import { supabase } from '@/lib/supabaseClient';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// TypeScriptのためにwindowオブジェクトを拡張
declare global {
  interface Window {
    _audioRetryCount?: number;
  }
}

// 話者データ型
interface Speaker {
  id: string;
  name: string;
  color: string;
}

// 文字起こし中の各発言の型
interface SpeechSegment {
  id: string;
  speakerId: string;
  text: string;
  startTime: number;
  endTime: number;
  isEditing: boolean;
}

// スピーカーの色のプリセット
const SPEAKER_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
];

// アニメーションバリアント
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.07 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  }
};

export default function MeetingMinuteDetailClient({ meetingMinuteId }: { meetingMinuteId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { facility } = useFacility();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);

  // 状態管理
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [meetingMinute, setMeetingMinute] = useState<MeetingMinute | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeakerDialogOpen, setIsSpeakerDialogOpen] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [isResummarizing, setIsResummarizing] = useState(false);
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // 議事録データの取得
  const fetchMeetingMinute = useCallback(async () => {
    if (!meetingMinuteId) return;

    setIsLoading(true);
    try {
      // Supabaseクライアント
      const supabaseClient = createClientComponentClient();
      
      const response = await fetch(`/api/meeting-minutes/${meetingMinuteId}`);
      if (!response.ok) throw new Error('議事録の取得に失敗しました');
      
      const data = await response.json();

      // オーディオファイルのURLを正しく構築
      if (data.audio_file_path) {
        // 既に完全なURLの場合はそのまま使用、そうでなければURLを構築
        if (!data.audio_file_path.startsWith('http')) {
          try {
            // ファイル名を取得
            const fileName = data.audio_file_path.split('/').pop();
            
            if (fileName) {
              // 新しいバケット「minutesaudio」を使用
              const apiUrl = `/api/meeting-minutes/audio/${encodeURIComponent(fileName)}`;
              data.audio_file_path = apiUrl;
              
              console.log('音声ファイルURL:', apiUrl);
            } else {
              console.error('ファイル名を抽出できませんでした');
              data.audio_file_path = '';
            }
          } catch (urlError) {
            console.error('URLの生成中にエラーが発生:', urlError);
            data.audio_file_path = '';
          }
        }
      }
      
      setMeetingMinute(data);
      setEditedContent(data.content || '');
      
      // 話者と発言セグメントのデータを初期化
      if (data.is_transcribed && data.content) {
        initializeTranscriptData(data.content);
      }
    } catch (error) {
      console.error('議事録取得エラー:', error);
      toast({
        title: 'エラー',
        description: '議事録の取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [meetingMinuteId, toast, user]);

  // 文字起こしデータの初期化 (サンプルとして適当にセグメント分割)
  const initializeTranscriptData = (content: string) => {
    // 既存の話者を初期化
    const initialSpeakers: Speaker[] = [
      { id: '1', name: '議長', color: SPEAKER_COLORS[0] },
      { id: '2', name: '参加者A', color: SPEAKER_COLORS[1] },
      { id: '3', name: '参加者B', color: SPEAKER_COLORS[2] },
    ];
    setSpeakers(initialSpeakers);
    
    // 内容を単純に段落で分割し、交互に話者を割り当てる
    const paragraphs = content.split('\n\n').filter(p => p.trim() !== '');
    
    const initialSegments: SpeechSegment[] = paragraphs.map((text, index) => {
      const speakerId = initialSpeakers[index % initialSpeakers.length].id;
      return {
        id: `segment-${index}`,
        speakerId,
        text,
        startTime: index * 30, // 仮の開始時間（秒）
        endTime: (index + 1) * 30 - 1, // 仮の終了時間（秒）
        isEditing: false
      };
    });
    
    setSegments(initialSegments);
  };

  // 初期データ取得
  useEffect(() => {
    if (meetingMinuteId) {
      fetchMeetingMinute();
    }
  }, [meetingMinuteId, fetchMeetingMinute]);

  // オーディオプレーヤーのイベントハンドラ
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 再生速度を設定
    audio.playbackRate = playbackRate;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      setDuration(audio.duration || 0);
    };

    const handleLoadedMetadata = () => {
      // メタデータが読み込まれたときにデュレーションを設定
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // 再生/一時停止の切り替え
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  // 特定の時間から再生
  const playFromTime = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = time;
    audio.play();
  };

  // 秒数をMM:SS形式に変換
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 戻るボタンのハンドラ
  const handleBack = () => {
    router.push('/meeting-minutes');
  };

  // 編集モードの切り替え
  const toggleEditing = () => {
    setIsEditing(!isEditing);
  };

  // 内容の保存
  const saveContent = async () => {
    if (!meetingMinute || !meetingMinuteId) return;

    setIsProcessing(true);
    try {
      // セグメントからコンテンツを再構築
      const combinedContent = segments.map(segment => segment.text).join('\n\n');
      
      const response = await fetch(`/api/meeting-minutes/${meetingMinuteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: combinedContent }),
      });

      if (!response.ok) throw new Error('議事録の更新に失敗しました');
      
      setMeetingMinute({
        ...meetingMinute,
        content: combinedContent,
      });
      
      setEditedContent(combinedContent);
      setIsEditing(false);
      
      toast({
        title: '保存完了',
        description: '議事録が更新されました',
      });
    } catch (error) {
      console.error('議事録更新エラー:', error);
      toast({
        title: 'エラー',
        description: '議事録の更新に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 要約の再生成
  const regenerateSummary = async () => {
    if (!meetingMinute || !meetingMinuteId) return;

    setIsResummarizing(true);
    try {
      // セグメントからコンテンツを再構築
      const combinedContent = segments.map(segment => segment.text).join('\n\n');
      
      const response = await fetch(`/api/meeting-minutes/${meetingMinuteId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: combinedContent }),
      });

      if (!response.ok) throw new Error('要約の生成に失敗しました');
      
      const data = await response.json();
      
      setMeetingMinute({
        ...meetingMinute,
        summary: data.summary,
      });
      
      toast({
        title: '要約完了',
        description: '会議の要約が再生成されました',
      });
    } catch (error) {
      console.error('要約生成エラー:', error);
      toast({
        title: 'エラー',
        description: '要約の生成に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsResummarizing(false);
    }
  };

  // 新しい話者の追加
  const addNewSpeaker = () => {
    if (!newSpeakerName.trim()) return;
    
    const newSpeaker: Speaker = {
      id: `speaker-${Date.now()}`,
      name: newSpeakerName.trim(),
      color: SPEAKER_COLORS[speakers.length % SPEAKER_COLORS.length],
    };
    
    setSpeakers([...speakers, newSpeaker]);
    setNewSpeakerName('');
  };

  // セグメントの話者変更
  const changeSpeakerForSegment = (segmentId: string, speakerId: string) => {
    setSegments(segments.map(segment => 
      segment.id === segmentId ? { ...segment, speakerId } : segment
    ));
  };

  // セグメントのテキスト編集
  const updateSegmentText = (segmentId: string, text: string) => {
    setSegments(segments.map(segment => 
      segment.id === segmentId ? { ...segment, text } : segment
    ));
  };

  // セグメント編集の開始/終了
  const toggleSegmentEditing = (segmentId: string) => {
    setSegments(segments.map(segment => 
      segment.id === segmentId 
        ? { ...segment, isEditing: !segment.isEditing } 
        : { ...segment, isEditing: false }
    ));
  };

  // ダウンロードボタンのハンドラ
  const handleDownload = () => {
    if (!meetingMinute) return;
    
    const fileName = `${meetingMinute.title}_${format(new Date(meetingMinute.meeting_date), 'yyyyMMdd')}.txt`;
    const content = `
${meetingMinute.title}
日時: ${format(new Date(meetingMinute.meeting_date), 'yyyy年MM月dd日', { locale: ja })}
出席者: ${meetingMinute.attendees?.join(', ') || ''}

【要約】
${meetingMinute.summary || '要約はありません'}

【議事内容】
${meetingMinute.content || '議事内容はありません'}
    `.trim();
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 再生速度の変更
  const changePlaybackRate = () => {
    if (!audioRef.current) return;
    
    // 再生速度を順番に切り替え (1.0 -> 1.25 -> 1.5 -> 1.75 -> 2.0 -> 0.75 -> 1.0)
    const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.75];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    
    audioRef.current.playbackRate = newRate;
    setPlaybackRate(newRate);
    
    // 変更を通知
    toast({
      title: '再生速度変更',
      description: `${newRate}倍速`,
      duration: 2000,
    });
  };

  // 音声プレーヤーコンポーネント
  const AudioPlayer = ({ audioFilePath }: { audioFilePath: string }) => {
    // ファイル名のみを抽出（パスを含む場合は除去）
    const fileName = audioFilePath.split('/').pop() || audioFilePath;
    
    // 新しいバケット「minutesaudio」を使用
    const apiUrl = `/api/meeting-minutes/audio/${encodeURIComponent(fileName)}`;
    
    // タイムスタンプ付きのフォールバックURL（キャッシュ回避用）
    const apiUrlWithTimestamp = `${apiUrl}?t=${Date.now()}`;
    
    // 複数のURLフォールバック - 両方ともファイル名のみを使用
    const audioUrls = [
      apiUrl,                   // 基本URL
      apiUrlWithTimestamp,      // タイムスタンプ付き
    ];
    
    const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const maxRetries = audioUrls.length * 2; // 各URLを複数回試行
    
    // ロード完了時
    const handleLoadSuccess = () => {
      setIsLoading(false);
      setLoadError(null);
      console.log('音声ファイルの読み込みに成功しました');
    };
    
    // ロードエラー時
    const handleLoadError = async (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
      console.error('音声ファイル読み込みエラー:', e);
      
      // 最大再試行回数を超えていない場合は次のURLを試す
      if (retryCount < maxRetries) {
        const nextIndex = (currentUrlIndex + 1) % audioUrls.length;
        console.log(`音声URL再試行: ${retryCount + 1}/${maxRetries}`, { 
          currentUrl: audioUrls[currentUrlIndex],
          nextUrl: audioUrls[nextIndex]
        });
        
        setRetryCount(prev => prev + 1);
        setCurrentUrlIndex(nextIndex);
        setIsLoading(true);
      } else {
        setIsLoading(false);
        setLoadError('音声ファイルの読み込みに失敗しました。');
        console.log('再試行回数上限に達しました');
      }
    };
    
    // 再試行ボタンでリフレッシュ
    const handleRetry = async () => {
      setIsLoading(true);
      setLoadError(null);
      setRetryCount(0);
      setCurrentUrlIndex(0);
      
      // 強制的にキャッシュを削除するためにタイムスタンプを追加
      const timestamp = Date.now();
      audioUrls[0] = apiUrl;
      audioUrls[1] = `${apiUrl}?t=${timestamp}`;
      
      console.log('音声URLリフレッシュ:', audioUrls);
    };
    
    return (
      <div className="mt-2">
        {isLoading && (
          <div className="flex items-center justify-center py-2">
            <div className="animate-spin h-4 w-4 mr-2 border-2 border-purple-500 border-t-transparent rounded-full" />
            <span className="text-xs text-purple-700">読み込み中...</span>
          </div>
        )}
        
        {loadError && (
          <div className="flex flex-col items-center justify-center py-2">
            <p className="text-xs text-red-500">{loadError}</p>
            <div className="text-xs text-gray-500 mt-1 mb-1">
              ファイル: {fileName}
            </div>
            <button 
              onClick={handleRetry}
              className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 py-1 px-2 mt-1 rounded-full"
            >
              再試行
            </button>
          </div>
        )}
        
        <audio 
          className="w-full" 
          controls 
          src={audioUrls[currentUrlIndex]}
          onError={handleLoadError}
          onLoadedData={handleLoadSuccess}
        />
        
        <div className="mt-1 text-xs text-gray-500">
          {audioFilePath.split('/').pop() || '音声データ'}
        </div>
      </div>
    );
  };

  // 会議議事録の表示
  if (meetingMinute) {
    const {
      title,
      meeting_date,
      content,
      summary,
      keywords,
      audio_file_path,
      speakers,
      segments,
      meeting_type,
      recorded_by_user,
      attendees
    } = meetingMinute;
    
    // キーワードの配列化
    const keywordsArray = Array.isArray(keywords) ? keywords : [];
    
    // 話者データの解析
    let speakersData = [];
    try {
      speakersData = typeof speakers === 'string' ? JSON.parse(speakers) : speakers || [];
    } catch (error) {
      console.error('話者データの解析エラー:', error);
    }
    
    // セグメントデータの解析
    let segmentsData = [];
    try {
      segmentsData = typeof segments === 'string' ? JSON.parse(segments) : segments || [];
    } catch (error) {
      console.error('セグメントデータの解析エラー:', error);
    }
    
    // 日付のフォーマット
    const formattedDate = meeting_date ? format(new Date(meeting_date), 'yyyy年MM月dd日 HH:mm', { locale: ja }) : '';
    
    // 参加者のフォーマット
    const attendeesList = Array.isArray(attendees) ? attendees.join(', ') : attendees || '';
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
        {/* ヘッダー部分 */}
        <AppHeader
          title="会議議事録詳細"
          icon={<FileText className="h-5 w-5 text-purple-500" />}
          onBackClick={() => router.push('/meeting-minutes')}
        />
        
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <Card className="overflow-hidden bg-white/80 backdrop-blur-sm border-purple-100">
            <CardHeader className="bg-gradient-to-r from-purple-100/80 to-pink-100/80 border-b border-purple-100 px-6 py-4">
              <CardTitle className="text-2xl font-bold text-purple-900">{title}</CardTitle>
              <div className="flex flex-wrap gap-3 mt-2">
                <div className="text-sm bg-white/60 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
                  <Calendar className="inline-block h-4 w-4 mr-1 relative -top-[1px]" /> {formattedDate}
                </div>
                {meeting_type?.name && (
                  <div className="text-sm bg-white/60 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
                    <Users className="inline-block h-4 w-4 mr-1 relative -top-[1px]" /> {meeting_type.name}
                  </div>
                )}
                {recorded_by_user?.email && (
                  <div className="text-sm bg-white/60 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
                    <UserCircle className="inline-block h-4 w-4 mr-1 relative -top-[1px]" /> {recorded_by_user.email}
                  </div>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="p-6">
              {attendeesList && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-purple-900 mb-2">参加者</h3>
                  <div className="text-sm text-gray-700 bg-white/60 p-3 rounded-lg border border-purple-100">
                    {attendeesList}
                  </div>
                </div>
              )}
              
              {summary && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-purple-900 mb-2">要約</h3>
                  <div className="whitespace-pre-wrap text-gray-700 bg-white/60 p-4 rounded-lg border border-purple-100">
                    {summary}
                  </div>
                </div>
              )}
              
              {keywordsArray.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-purple-900 mb-2">キーワード</h3>
                  <div className="flex flex-wrap gap-2">
                    {keywordsArray.map((keyword, idx) => (
                      <div key={idx} className="text-sm bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100">
                        {keyword}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 音声プレーヤー */}
              {audio_file_path && (
                <div className="mb-4 flex items-center space-x-2 text-md">
                  <div className="min-w-[100px] font-semibold">録音:</div>
                  <div className="flex-1">
                    <AudioPlayer audioFilePath={audio_file_path} />
                  </div>
                </div>
              )}
              
              {/* 本文表示（話者データがある場合はセグメント表示） */}
              {speakersData.length > 0 && segmentsData.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-purple-900 mb-2">会議内容</h3>
                  <div className="space-y-4">
                    {segmentsData.map((segment, index) => {
                      const speaker = speakersData.find(s => s.id === segment.speakerId) || { name: '話者不明', color: '#666666' };
                      return (
                        <div 
                          key={index} 
                          className="rounded-lg p-4 bg-white/80 border border-purple-100"
                          style={{ borderLeft: `4px solid ${speaker.color}` }}
                        >
                          <div className="font-semibold text-purple-800 mb-1">{speaker.name}</div>
                          <div className="text-gray-700 whitespace-pre-wrap">{segment.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : content ? (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-purple-900 mb-2">会議内容</h3>
                  <div className="whitespace-pre-wrap text-gray-700 bg-white/60 p-4 rounded-lg border border-purple-100">
                    {content}
                  </div>
                </div>
              ) : null}
              
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  className="rounded-full px-6 py-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                  onClick={() => router.push('/meeting-minutes')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> 一覧に戻る
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* ヘッダー - モバイルアプリ風 */}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold line-clamp-1">
            {meetingMinute?.title || '議事録'}
          </h1>
        </div>
        <div className="flex">
          {!isEditing ? (
            <>
              <Button variant="ghost" size="icon" onClick={toggleEditing}>
                <Edit2 className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload}>
                <Download className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleEditing} 
                disabled={isProcessing}
              >
                <X className="h-5 w-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={saveContent} 
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      {isLoading ? (
        <div className="flex justify-center items-center flex-1">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      ) : meetingMinute ? (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {/* 会議の概要情報 */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemVariants} className="mb-4">
                <Card className="p-4 bg-white">
                  <div className="flex flex-wrap gap-y-2">
                    <div className="flex items-center text-sm text-slate-600 mr-4">
                      <Calendar className="h-4 w-4 mr-1 text-slate-400" />
                      {format(new Date(meetingMinute.meeting_date), 'yyyy年MM月dd日', { locale: ja })}
                    </div>
                    
                    <div className="flex items-center text-sm text-slate-600">
                      <Users className="h-4 w-4 mr-1 text-slate-400" />
                      {meetingMinute.attendees?.length > 0 
                        ? `${meetingMinute.attendees.length}名` 
                        : '参加者情報なし'}
                    </div>
                  </div>
                  
                  {meetingMinute.is_transcribed && meetingMinute.audio_file_path && (
                    <div className="mt-4">
                      <audio 
                        ref={audioRef} 
                        src={meetingMinute.audio_file_path}
                        className="hidden" 
                        controls 
                        preload="metadata"
                        crossOrigin="anonymous"
                        onError={async (e) => {
                          // 音声が再生できない場合のメッセージを表示して試行を中止する
                          const handleFailure = (message = '音声ファイルを再生できません。管理者に連絡してください。') => {
                            toast({
                              title: '音声ファイルエラー',
                              description: message,
                              variant: 'destructive',
                              duration: 5000,
                            });
                            
                            // 不要なプレーヤーUIを非表示にする
                            const audioContainer = audioRef.current?.parentElement;
                            if (audioContainer) {
                              audioContainer.style.display = 'none';
                            }
                          };
                          
                          // 再試行回数を保存するための静的変数
                          if (typeof window !== 'undefined') {
                            if (window._audioRetryCount === undefined) {
                              window._audioRetryCount = 0;
                            } else {
                              window._audioRetryCount++;
                            }
                          }
                          
                          // エラー情報の記録
                          console.error('音声ファイル読み込みエラー:', e);
                          
                          // 再試行回数が上限に達した場合
                          if (window._audioRetryCount !== undefined && window._audioRetryCount >= 2) {
                            console.log('再試行回数上限に達しました');
                            window._audioRetryCount = 0; // リセット
                            handleFailure('音声ファイルを再生できません。ファイルが存在しないか、アクセス権限の問題があります。');
                            return;
                          }
                          
                          // オーディオ要素の取得
                          const audioElement = audioRef.current;
                          if (!audioElement) {
                            handleFailure('オーディオ要素が見つかりません');
                            return;
                          }
                          
                          try {
                            // 現在のソースURLを確認
                            const currentSrc = audioElement.src || '';
                            
                            // ファイル名抽出 - パスは無視
                            const fileName = meetingMinute?.audio_file_path?.split('/').pop() || 
                                            currentSrc.split('/').pop()?.split('?')[0] || '';
                            
                            if (!fileName) {
                              handleFailure('音声ファイル名が取得できません');
                              return;
                            }
                            
                            // 新しいバケット「minutesaudio」を使用
                            const newUrl = `/api/meeting-minutes/audio/${encodeURIComponent(fileName)}?t=${Date.now()}`;
                            console.log('音声ファイルの再試行URL:', newUrl);
                            
                            // 新しいURLをセット
                            audioElement.src = newUrl;
                            audioElement.load();
                            
                          } catch (error) {
                            console.error('音声URL構築エラー:', error);
                            handleFailure('音声ファイルのURLを構築できませんでした');
                          }
                        }}
                      />
                      
                      {/* 音声プレーヤーUI */}
                      <div className="bg-slate-100 rounded-lg p-4">
                        {/* 日付・参加者情報 */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-xs text-slate-600">
                            録音日: {format(new Date(meetingMinute.meeting_date), 'yyyy年MM月dd日', { locale: ja })}
                          </div>
                          <div className="text-xs text-slate-600">
                            長さ: {formatTime(duration || 0)}
                          </div>
                        </div>
                        
                        {/* 再生時間表示 */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-slate-700">
                            {formatTime(currentTime || 0)}
                          </span>
                          <span className="text-sm text-slate-500">
                            -{formatTime(Math.max(0, (duration || 0) - (currentTime || 0)))}
                          </span>
                        </div>
                        
                        {/* 再生位置スライダー */}
                        <div 
                          className="relative h-2 bg-slate-200 rounded-full overflow-hidden cursor-pointer mb-4"
                          onClick={(e) => {
                            try {
                              const container = e.currentTarget;
                              const rect = container.getBoundingClientRect();
                              const pos = (e.clientX - rect.left) / rect.width;
                              if (audioRef.current && duration) {
                                const newTime = pos * duration;
                                audioRef.current.currentTime = newTime;
                                setCurrentTime(newTime);
                              }
                            } catch (error) {
                              console.error('シークエラー:', error);
                            }
                          }}
                        >
                          <div 
                            className="absolute top-0 left-0 h-full bg-primary rounded-full"
                            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                          />
                          <div
                            className="absolute top-0 h-full"
                            style={{ 
                              left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className="w-3 h-3 bg-white rounded-full border-2 border-primary shadow-sm" />
                          </div>
                        </div>
                        
                        {/* コントロールボタン */}
                        <div className="flex items-center justify-center space-x-4">
                          {/* 頭出しボタン */}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-9 w-9 rounded-full bg-white shadow-sm"
                            onClick={() => {
                              try {
                                if (audioRef.current) {
                                  audioRef.current.currentTime = 0;
                                  setCurrentTime(0);
                                }
                              } catch (error) {
                                console.error('頭出しエラー:', error);
                              }
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <polygon points="19 20 9 12 19 4 19 20"></polygon>
                              <line x1="5" y1="19" x2="5" y2="5"></line>
                            </svg>
                          </Button>
                          
                          {/* 10秒戻るボタン */}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-9 w-9 rounded-full bg-white shadow-sm"
                            onClick={() => {
                              try {
                                if (audioRef.current) {
                                  const newTime = Math.max(0, audioRef.current.currentTime - 10);
                                  audioRef.current.currentTime = newTime;
                                  setCurrentTime(newTime);
                                }
                              } catch (error) {
                                console.error('巻き戻しエラー:', error);
                              }
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <polyline points="1 4 1 10 7 10"></polyline>
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                            <span className="absolute text-[9px] font-bold">10</span>
                          </Button>
                          
                          {/* 再生/一時停止ボタン */}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-12 w-12 rounded-full bg-primary text-white shadow-sm"
                            onClick={() => {
                              try {
                                togglePlayPause();
                              } catch (error) {
                                console.error('再生エラー:', error);
                                toast({
                                  title: '再生エラー',
                                  description: '音声の再生に失敗しました。',
                                  variant: 'destructive',
                                });
                              }
                            }}
                          >
                            {isPlaying ? (
                              <Pause className="h-6 w-6" />
                            ) : (
                              <Play className="h-6 w-6 ml-1" />
                            )}
                          </Button>
                          
                          {/* 10秒進むボタン */}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-9 w-9 rounded-full bg-white shadow-sm"
                            onClick={() => {
                              try {
                                if (audioRef.current) {
                                  const newTime = Math.min(duration || 0, audioRef.current.currentTime + 10);
                                  audioRef.current.currentTime = newTime;
                                  setCurrentTime(newTime);
                                }
                              } catch (error) {
                                console.error('早送りエラー:', error);
                              }
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <polyline points="23 4 23 10 17 10"></polyline>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                            <span className="absolute text-[9px] font-bold">10</span>
                          </Button>
                          
                          {/* 再生速度調整ボタン */}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-9 px-2 rounded-full bg-white shadow-sm text-xs font-medium"
                            onClick={() => {
                              try {
                                changePlaybackRate();
                              } catch (error) {
                                console.error('再生速度変更エラー:', error);
                              }
                            }}
                          >
                            {playbackRate}x
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>

              {/* 要約 */}
              <motion.div variants={itemVariants} className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">要約</h2>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={regenerateSummary}
                    disabled={isResummarizing || !meetingMinute.is_transcribed}
                    className="h-8"
                  >
                    {isResummarizing ? (
                      <Loader className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    再要約
                  </Button>
                </div>
                <Card className="p-4 bg-white">
                  {meetingMinute.summary ? (
                    <p className="text-sm whitespace-pre-wrap">{meetingMinute.summary}</p>
                  ) : (
                    <p className="text-sm text-slate-500 italic">要約はまだありません</p>
                  )}
                </Card>
              </motion.div>

              {/* 話者設定ダイアログ */}
              <Dialog open={isSpeakerDialogOpen} onOpenChange={setIsSpeakerDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>話者の設定</DialogTitle>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <h3 className="text-sm font-medium">話者一覧</h3>
                      {speakers.map(speaker => (
                        <div key={speaker.id} className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className={`w-4 h-4 rounded-full mr-2 ${speaker.color.split(' ')[0]}`} />
                            <span>{speaker.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid gap-2">
                      <h3 className="text-sm font-medium">新しい話者を追加</h3>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSpeakerName}
                          onChange={(e) => setNewSpeakerName(e.target.value)}
                          placeholder="話者名"
                          className="flex-1 p-2 text-sm border rounded-md"
                        />
                        <Button onClick={addNewSpeaker} size="sm">追加</Button>
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button onClick={() => setIsSpeakerDialogOpen(false)}>
                      閉じる
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* 議事内容 */}
              <motion.div variants={itemVariants}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">議事内容</h2>
                  
                  {meetingMinute.is_transcribed && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setIsSpeakerDialogOpen(true)}
                      className="h-8"
                    >
                      <UserCircle className="h-4 w-4 mr-1" />
                      話者設定
                    </Button>
                  )}
                </div>
                
                {meetingMinute.is_transcribed ? (
                  <div className="space-y-3">
                    {segments.map((segment, index) => (
                      <div 
                        key={segment.id}
                        className={cn(
                          "relative transition-all", 
                          focusedSegmentId === segment.id ? "scale-[1.02] z-10" : ""
                        )}
                      >
                        <Card 
                          className={cn(
                            "p-4 overflow-hidden transition-all",
                            segment.isEditing ? "ring-2 ring-primary" : ""
                          )}
                        >
                          {/* 話者情報 */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <div className="relative group">
                                <select
                                  value={segment.speakerId}
                                  onChange={(e) => changeSpeakerForSegment(segment.id, e.target.value)}
                                  className={cn(
                                    "appearance-none border rounded-full px-3 py-1 pr-8 text-xs",
                                    speakers.find(s => s.id === segment.speakerId)?.color || ""
                                  )}
                                >
                                  {speakers.map(speaker => (
                                    <option key={speaker.id} value={speaker.id}>
                                      {speaker.name}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 pointer-events-none" />
                              </div>
                              
                              <span className="text-xs text-slate-500 ml-2">
                                {formatTime(segment.startTime)}
                              </span>
                            </div>
                            
                            <div className="flex gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6"
                                onClick={() => playFromTime(segment.startTime)}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                              
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6"
                                onClick={() => toggleSegmentEditing(segment.id)}
                              >
                                {segment.isEditing ? <Check className="h-3 w-3" /> : <Edit2 className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                          
                          {/* 文字起こしテキスト */}
                          {segment.isEditing ? (
                            <Textarea
                              value={segment.text}
                              onChange={(e) => updateSegmentText(segment.id, e.target.value)}
                              className="min-h-[100px] text-sm"
                              autoFocus
                              onFocus={() => setFocusedSegmentId(segment.id)}
                              onBlur={() => setFocusedSegmentId(null)}
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{segment.text}</p>
                          )}
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card className="p-4 bg-white">
                    {meetingMinute.content ? (
                      <p className="text-sm whitespace-pre-wrap">{meetingMinute.content}</p>
                    ) : (
                      <p className="text-sm text-slate-500 italic">議事内容はまだありません</p>
                    )}
                  </Card>
                )}
              </motion.div>
            </motion.div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex justify-center items-center flex-1 text-slate-500">
          議事録が見つかりません
        </div>
      )}
    </div>
  );
} 