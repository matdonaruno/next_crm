'use client';
import React, { useRef, useState } from 'react';
import { Loader2, FileAudio } from 'lucide-react';

interface Props {
  audioUrl: string; // すでにバケット名が取り除かれたパスを受け取る
}

export default function AudioPlayer({ audioUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // ファイルパスからファイル名部分を抽出
  const fileName = audioUrl.split('/').pop() || audioUrl;
  
  // API経由でファイルにアクセスするURL - すでに処理済みのパスを使用
  const apiAudioUrl = `/api/meeting-minutes/audio/${encodeURIComponent(audioUrl)}`;
  
  // 開発モードでのみキャッシュバスティングパラメータを追加
  const audioSrc = process.env.NODE_ENV === 'development' 
    ? `${apiAudioUrl}?t=${Date.now()}`
    : apiAudioUrl;

  const handleLoadSuccess = () => {
    setIsLoading(false);
    setLoadError(null);
  };

  const handleLoadError = () => {
    setIsLoading(false);
    setLoadError('音声の読み込みに失敗しました');
    console.error('音声ファイルの読み込みエラー:', apiAudioUrl);
    
    // エラー時は再生を停止
    audioRef.current?.pause();
  };

  return (
    <div className="mb-6">
      {/* ファイル名表示 */}
      <div className="flex items-center mb-2 text-sm text-gray-700 bg-gray-50 p-2 rounded-md">
        <FileAudio className="h-4 w-4 mr-2 text-blue-500" />
        <span>{fileName}</span>
      </div>
      
      {isLoading && (
        <div className="flex items-center">
          <Loader2 className="animate-spin h-4 w-4 mr-2" /> 読み込み中…
        </div>
      )}
      {loadError && (
        <div className="text-red-500 text-sm">{loadError}</div>
      )}
      <audio
        ref={audioRef}
        className="w-full"
        controls
        src={audioSrc}
        onLoadedData={handleLoadSuccess}
        onError={handleLoadError}
      />
    </div>
  );
}
