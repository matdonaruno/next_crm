'use client';
import React, { ChangeEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, ArrowLeft, Shield, Users, Lock } from 'lucide-react';

type MeetingType = {
  id: string;
  name: string;
};

type Props = {
  title: string;
  meetingTypeId: string;
  meetingTypes: MeetingType[];
  loadingTypes: boolean;
  meetingDate: string;
  attendees: string;
  generatedTitle: string;
  isLoading: boolean;
  accessLevel?: string;
  setTitle: (v: string) => void;
  setMeetingTypeId: (v: string) => void;
  setMeetingDate: (v: string) => void;
  setAttendees: (v: string) => void;
  setAccessLevel?: (v: string) => void;
  nextStep: () => void;
  prevStep: () => void;
};

export default function InfoStep({
  title,
  meetingTypeId,
  meetingTypes,
  loadingTypes,
  meetingDate,
  attendees,
  generatedTitle,
  isLoading,
  accessLevel = 'all',
  setTitle,
  setMeetingTypeId,
  setMeetingDate,
  setAttendees,
  setAccessLevel,
  nextStep,
  prevStep,
}: Props) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <Card className="space-y-4 p-6 shadow-sm border-slate-200">
        <h2 className="text-lg font-semibold">会議情報</h2>

        <div className="space-y-3">
          <Label>会議種類 <span className="text-red-500">*</span></Label>
          {loadingTypes ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-500">読み込み中...</div>
            </div>
          ) : meetingTypes && meetingTypes.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {meetingTypes.map((type, index) => {
                // グラデーション色の計算（薄紫から薄ピンク）
                const progress = meetingTypes.length > 1 ? index / (meetingTypes.length - 1) : 0;
                const hue = 270 - (progress * 60); // 270度(紫)から210度(薄ピンク)へ
                const lightColor = `hsl(${hue}, 30%, 95%)`;
                const hoverColor = `hsl(${hue}, 40%, 90%)`;
                const selectedColor = `hsl(${hue}, 60%, 75%)`;
                
                return (
                  <Button
                    key={type.id}
                    variant="outline"
                    className={`
                      h-20 p-3 text-xs font-medium transition-all duration-200 
                      whitespace-normal text-center leading-tight
                      border-2 rounded-lg shadow-sm
                      ${meetingTypeId === type.id
                        ? `text-white shadow-lg border-opacity-50` 
                        : `text-slate-700 hover:shadow-md`
                      }
                    `}
                    style={{
                      backgroundColor: meetingTypeId === type.id ? selectedColor : lightColor,
                      borderColor: meetingTypeId === type.id ? selectedColor : `hsl(${hue}, 25%, 80%)`,
                    }}
                    onMouseEnter={(e) => {
                      if (meetingTypeId !== type.id) {
                        e.currentTarget.style.backgroundColor = hoverColor;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (meetingTypeId !== type.id) {
                        e.currentTarget.style.backgroundColor = lightColor;
                      }
                    }}
                    onClick={() => setMeetingTypeId(type.id)}
                  >
                    {type.name}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-500">会議種類が見つかりません</div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">日時 <span className="text-red-500">*</span></Label>
          <Input
            id="date"
            type="datetime-local"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">タイトル</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={generatedTitle || '会議のタイトル'}
          />
          {generatedTitle && (
            <p className="text-xs text-slate-500 mt-1">
              会議種類と日付から自動生成: {generatedTitle}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="attendees">参加者(カンマ区切り)</Label>
          <Textarea
            id="attendees"
            value={attendees}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setAttendees(e.target.value)
            }
            placeholder="例: 山田太郎, 鈴木花子, 田中一郎"
          />
        </div>

        {setAccessLevel && (
          <div className="space-y-2">
            <Label htmlFor="accessLevel">閲覧権限</Label>
            <Select value={accessLevel} onValueChange={setAccessLevel}>
              <SelectTrigger id="accessLevel">
                <SelectValue placeholder="閲覧権限を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-2 text-green-600" />
                    <span>全員閲覧可能</span>
                  </div>
                </SelectItem>
                <SelectItem value="chief_and_above">
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-2 text-blue-600" />
                    <span>主任以上のみ閲覧可能</span>
                  </div>
                </SelectItem>
                <SelectItem value="admin_only">
                  <div className="flex items-center">
                    <Lock className="h-4 w-4 mr-2 text-red-600" />
                    <span>管理者のみ閲覧可能</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">
              ※幹部会議など機密性の高い内容の場合は、適切な権限を設定してください
            </p>
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={() => window.history.back()}
          disabled={isLoading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>

        <Button
          onClick={nextStep}
          disabled={!meetingTypeId || isLoading}
        >
          次へ
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 