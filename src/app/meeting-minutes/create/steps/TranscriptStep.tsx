'use client';
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, ArrowRight, Edit, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

type Props = {
  transcriptionText: string;
  isProcessing: boolean;
  isLoading: boolean;
  saveSuccess: boolean;
  nextStep: () => void;
  prevStep: () => void;
  // saveMeetingMinute: () => void; // 削除
  processAudio: () => void; // 追加
};

export default function TranscriptStep({
  transcriptionText,
  isProcessing,
  isLoading,
  saveSuccess,
  nextStep,
  prevStep,
  // saveMeetingMinute, // この行はすでにコメントアウトまたは削除されているはずです
  processAudio, // processAudio を Props から受け取る
}: Props) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <Card className="p-4 mb-6 rounded-xl shadow-sm border-slate-200">
        <h2 className="text-lg font-semibold mb-4">文字起こし</h2>
        
        {isProcessing ? (
          <div className="flex flex-col justify-center items-center h-40 p-8">
            <LoadingSpinner message="文字起こし処理中..." />
          </div>
        ) : transcriptionText ? (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg min-h-[120px]">
              <p className="text-slate-700">{transcriptionText}</p>
            </div>
            
            <Button
              onClick={nextStep}
              className="w-full"
              variant="outline"
              disabled={isLoading}
            >
              <Edit className="mr-2 h-4 w-4" /> 文字起こし結果を編集
            </Button>
          </div>
        ) : (
          <div className="flex flex-col justify-center items-center p-8">
            <p className="text-slate-500 text-center">
              文字起こしを開始するために「議事録作成」ボタンをクリックしてください。
            </p>
          </div>
        )}
      </Card>
      
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={isProcessing}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
        </Button>
        
        {!saveSuccess ? (
          <Button
            // onClick={saveMeetingMinute} // 変更前
            onClick={processAudio} // 変更後: processAudio を呼び出す
            disabled={isLoading || isProcessing}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> 保存
              </>
            )}
          </Button>
        ) : (
          <Button onClick={nextStep} className="bg-green-600 hover:bg-green-700">
            <ArrowRight className="mr-2 h-4 w-4" /> 次へ
          </Button>
        )}
      </div>
      
      <p className="mt-4 text-center text-xs text-slate-500">
        音声を保存すると自動で文字起こしが行われ、議事録が作成されます。
      </p>
    </div>
  );
}