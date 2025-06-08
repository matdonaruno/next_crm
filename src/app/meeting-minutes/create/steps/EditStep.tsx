// src/app/meeting-minutes/create/steps/EditStep.tsx
'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, RefreshCw, UserCircle, UserPlus } from 'lucide-react';

/* EditStep 用のローカル型定義 */
type Speaker = {
  id: string;
  name: string;
};
type Segment = {
  speakerId: string;
  text: string;
};

type Props = {
  transcriptionText: string;
  isLoading: boolean;
  prevStep: () => void;
  saveMeetingMinute: (editData: { segments: Segment[]; speakers: Speaker[] }) => Promise<void>;
};

export default function EditStep({
  transcriptionText,
  isLoading,
  prevStep,
  saveMeetingMinute,
}: Props) {
  // 話者のモックデータ（実際は useMeetingCreator から渡してもいい）
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: '1', name: '進行役' },
    { id: '2', name: '参加者A' },
  ]);

  // 文字起こしセグメントの初期値として transcriptionText をひとつのセグメントに入れる
  const [segments, setSegments] = useState<Segment[]>([
    { speakerId: '1', text: transcriptionText || '' },
  ]);

  /* 話者追加 */
  const addSpeaker = () => {
    const newId = String(speakers.length + 1);
    setSpeakers([...speakers, { id: newId, name: `参加者${newId}` }]);
  };

  /* 話者名変更 */
  const updateSpeakerName = (id: string, name: string) => {
    setSpeakers(speakers.map((s) =>
      s.id === id ? { ...s, name } : s
    ));
  };

  /* セグメント更新 */
  const updateSegment = (index: number, text: string) => {
    const newSegments = [...segments];
    newSegments[index] = { ...newSegments[index], text };
    setSegments(newSegments);
  };

  /* 話者変更 */
  const changeSpeaker = (index: number, speakerId: string) => {
    const newSegments = [...segments];
    newSegments[index] = { ...newSegments[index], speakerId };
    setSegments(newSegments);
  };

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <Card className="p-4 mb-6 rounded-xl shadow-sm border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">文字起こし編集</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={addSpeaker}
            className="rounded-full border-indigo-200 text-indigo-600 hover:bg-indigo-50"
          >
            <UserPlus className="h-4 w-4 mr-2" /> 話者追加
          </Button>
        </div>

        {/* 話者リスト */}
        <div className="flex flex-wrap gap-2 mb-4">
          {speakers.map((speaker) => (
            <div
              key={speaker.id}
              className="flex items-center bg-white/60 rounded-full px-3 py-1 border border-indigo-100"
              style={{ borderLeft: `4px solid #6366f1` }}
            >
              <UserCircle className="h-4 w-4 mr-1 text-indigo-500" />
              <Input
                value={speaker.name}
                onChange={(e) => updateSpeakerName(speaker.id, e.target.value)}
                className="border-none bg-transparent p-0 h-6 w-20 text-sm focus-visible:ring-0"
              />
            </div>
          ))}
        </div>

        {/* セグメント編集 */}
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {segments.map((segment, index) => (
            <div
              key={index}
              className="border rounded-xl p-3 bg-white/60 border-indigo-100"
              style={{ borderLeft: `4px solid #6366f1` }}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                  <UserCircle className="h-5 w-5 text-indigo-500" />
                  <select
                    value={segment.speakerId}
                    onChange={(e) => changeSpeaker(index, e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0"
                  >
                    {speakers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Textarea
                value={segment.text}
                onChange={(e) => updateSegment(index, e.target.value)}
                placeholder="文字起こし内容"
                className="mt-1 min-h-24 text-base border-indigo-100"
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={isLoading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
        </Button>

        <Button
          onClick={() => saveMeetingMinute({ segments, speakers })}
          disabled={isLoading}
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
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        編集が完了したら「保存」ボタンをクリックして議事録を作成します。
      </p>
    </div>
  );
}