'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Edit2, Save, X } from 'lucide-react';

export interface TranscriptSegment {
  id: string | number;
  speaker: string;
  color: string;
  text: string;
  speakerId?: string;
  timestamp?: number;
}

interface Props {
  segments: TranscriptSegment[];
  isEditable?: boolean;
  onSegmentUpdate?: (segmentId: string | number, newText: string) => void;
}

export default function TranscriptViewer({ segments, isEditable = false, onSegmentUpdate }: Props) {
  const [editingSegment, setEditingSegment] = useState<string | number | null>(null);
  const [editText, setEditText] = useState('');

  if (segments.length === 0) {
    return <div className="text-sm text-gray-500">文字起こしデータがありません</div>;
  }

  const handleEditStart = (segment: TranscriptSegment) => {
    setEditingSegment(segment.id);
    setEditText(segment.text);
  };

  const handleEditSave = (segmentId: string | number) => {
    if (onSegmentUpdate) {
      onSegmentUpdate(segmentId, editText);
    }
    setEditingSegment(null);
    setEditText('');
  };

  const handleEditCancel = () => {
    setEditingSegment(null);
    setEditText('');
  };

  return (
    <div className="space-y-4 my-4">
      {segments.map(seg => (
        <div key={String(seg.id)} className="rounded-lg p-4 bg-white border" style={{ borderLeft: `4px solid ${seg.color}` }}>
          <div className="flex justify-between items-center mb-2">
            <div className="font-semibold text-sm" style={{ color: seg.color }}>
              {seg.speaker}
              {seg.timestamp && (
                <span className="text-xs text-gray-500 ml-2">
                  {Math.floor(seg.timestamp / 60)}:{String(seg.timestamp % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            {isEditable && editingSegment !== seg.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditStart(seg)}
                className="h-6 w-6 p-0"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          {editingSegment === seg.id ? (
            <div className="space-y-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[80px] text-sm"
                placeholder="発言内容を編集..."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleEditSave(seg.id)}
                  className="h-7 px-2"
                >
                  <Save className="h-3 w-3 mr-1" />
                  保存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditCancel}
                  className="h-7 px-2"
                >
                  <X className="h-3 w-3 mr-1" />
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {seg.text}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
