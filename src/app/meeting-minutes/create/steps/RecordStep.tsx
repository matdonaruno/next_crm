'use client';
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import Waveform from '../Waveform';

type Props = {
  isRecording: boolean;
  duration: number;
  blob: Blob | null;
  audioRef: React.RefObject<HTMLAudioElement>;
  audioUrl: string | null;
  isPlaying: boolean;
  isUploading: boolean;
  isProcessing: boolean;
  isLoading: boolean;
  progress: number;
  formatTime: (seconds: number) => string;
  startRecording: () => void;
  stopRecording: () => void;
  deleteRecording: () => void;
  togglePlayback: () => void;
  processAudio: () => void;
  nextStep: () => void;
  prevStep: () => void;
};

export default function RecordStep({
  isRecording,
  duration,
  blob,
  audioRef,
  audioUrl,
  isPlaying,
  isUploading,
  isProcessing,
  isLoading,
  progress,
  formatTime,
  startRecording,
  stopRecording,
  deleteRecording,
  togglePlayback,
  processAudio,
  nextStep,
  prevStep,
}: Props) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <Card className="overflow-hidden shadow-sm border-slate-200">
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">録音</h2>
          
          <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl border-indigo-200 bg-white/60">
            {isRecording ? (
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-mono text-red-600 z-10">{formatTime(duration)}</span>
                </div>
                <Waveform isRecording={true} />
                <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                  <div className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full animate-pulse">
                    録音中...
                  </div>
                </div>
              </div>
            ) : (
              <>
                {blob ? (
                  <div className="relative w-full">
                    <div className="text-center">
                      <p className="font-semibold text-slate-700">録音完了</p>
                      <p className="text-sm text-slate-500">
                        長さ: {formatTime(duration)} ({Math.round(blob.size / 1024)} KB)
                      </p>
                      
                      {/* 非表示のオーディオ要素 */}
                      <audio 
                        ref={audioRef} 
                        src={audioUrl || undefined} 
                        className="hidden"
                      />
                    </div>
                    <Waveform isRecording={false} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4">
                    <p className="text-sm text-slate-500 mb-3">録音ボタンをタップして会議を録音します</p>
                    <Waveform isRecording={false} />
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="flex items-center justify-center gap-2 mt-4">
            {isRecording ? (
              <Button 
                onClick={stopRecording} 
                variant="destructive" 
                className="rounded-full h-12 w-12 p-0"
              >
                <MicOff className="h-5 w-5" />
              </Button>
            ) : (
              <>
                <Button 
                  onClick={startRecording} 
                  className="rounded-full h-12 w-12 p-0 bg-indigo-500 hover:bg-indigo-600"
                >
                  <Mic className="h-5 w-5" />
                </Button>
                
                {blob && (
                  <>
                    <Button
                      variant="outline"
                      onClick={togglePlayback}
                      className="rounded-lg text-sm px-3 h-10 border-indigo-200 text-indigo-600"
                    >
                      {isPlaying ? "停止" : "再生"}
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={deleteRecording}
                      className="rounded-lg text-sm px-3 h-10 border-slate-200"
                    >
                      リセット
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        
        {progress > 0 && progress < 100 && (
          <div className="h-1 bg-slate-100">
            <div 
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>

        <Button
          onClick={processAudio}
          disabled={
            !blob ||
            isRecording ||
            isUploading ||
            isProcessing ||
            isLoading
          }
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {isUploading || isProcessing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              処理中...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              議事録作成
            </>
          )}
        </Button>
      </div>
    </div>
  );
} 