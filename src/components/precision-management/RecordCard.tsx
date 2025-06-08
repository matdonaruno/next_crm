'use client';
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, Loader2, PcCase, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/common/LoadingSpinner';
import HistoryPanel from './HistoryPanel';
import { RecordCardType, ImplementationTiming } from './types';

interface Props {
  card: RecordCardType;
  timings: ImplementationTiming[];
  submittedCount: number;
  expanded: boolean;
  isSubmitting: boolean;
  submittingCardId: string | null;
  onToggleHistory: (id: string) => void;
  onInputChange: (equipmentId: number, field: keyof RecordCardType['data'], value: any) => void;
  onSubmit: (card: RecordCardType) => Promise<void>;
}

export default function RecordCard({
  card,
  timings,
  submittedCount,
  expanded,
  isSubmitting,
  submittingCardId,
  onToggleHistory,
  onInputChange,
  onSubmit
}: Props) {
  const cardId = card.equipment.pm_equipment_id.toString();
  const hasSubmitted = submittedCount > 0;
  const isCardSubmitting = isSubmitting && submittingCardId === cardId;
  const isOtherTiming = (id: number | null) => {
    const t = timings.find(x => x.timing_id === id);
    return t?.timing_name.includes('その他') || false;
  };

  return (
    <>
      <tr className={hasSubmitted ? 'bg-green-50' : ''}>
        <td className="font-medium">
          <div className="flex items-center">
            <PcCase className="h-4 w-4 text-primary mr-2" />
            {card.equipment.equipment_name}
          </div>
          {hasSubmitted && (
            <div className="flex items-center justify-between text-green-600 text-xs mt-1">
              <div className="flex items-center">
                <CheckCircle2 className="h-3 w-3 mr-1" /> 本日{submittedCount}件の記録済
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onToggleHistory(cardId)}
              >
                {expanded ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>
          )}
        </td>
        <td>
          <Select
            value={card.data.timing_id?.toString() || ''}
            onValueChange={v => onInputChange(card.equipment.pm_equipment_id, 'timing_id', Number(v))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="タイミングを選択" />
            </SelectTrigger>
            <SelectContent>
              {timings.map(t => (
                <SelectItem key={t.timing_id} value={t.timing_id.toString()}>
                  {t.timing_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="text-center">
          <Input
            type="time"
            value={card.data.implementation_time}
            onChange={e => onInputChange(card.equipment.pm_equipment_id, 'implementation_time', e.target.value)}
            className={`h-9 text-sm w-24 mx-auto text-center ${
              isOtherTiming(card.data.timing_id) ? 'border-2 border-primary bg-primary/5' : ''
            }`}
            step="900"
          />
        </td>
        <td className="text-center">
          <Input
            type="number"
            min={1}
            value={card.data.implementation_count}
            onChange={e => onInputChange(card.equipment.pm_equipment_id, 'implementation_count', Number(e.target.value))}
            className="h-9 text-sm w-16 mx-auto text-center"
          />
        </td>
        <td className="text-center">
          <Input
            type="number"
            min={0}
            value={card.data.error_count}
            onChange={e => onInputChange(card.equipment.pm_equipment_id, 'error_count', Number(e.target.value))}
            className="h-9 text-sm w-16 mx-auto text-center"
          />
        </td>
        <td className="text-center">
          <Checkbox
            checked={card.data.shift_trend}
            onCheckedChange={v => onInputChange(card.equipment.pm_equipment_id, 'shift_trend', v === true)}
          />
        </td>
        <td>
          <Textarea
            value={card.data.remarks}
            onChange={e => onInputChange(card.equipment.pm_equipment_id, 'remarks', e.target.value)}
            className="h-9 min-h-0 resize-none text-sm"
          />
        </td>
        <td className="text-center">
          <Button
            size="sm"
            variant="secondary"
            disabled={isCardSubmitting || card.data.timing_id === null}
            className="h-8 w-full text-xs"
            onClick={() => onSubmit(card)}
          >
            {isCardSubmitting
              ? <>
                  <ButtonSpinner className="mr-1 h-3 w-3" /> 登録中
                </>
              : <>
                  <Save className="mr-1 h-3 w-3" /> 登録
                </>
            }
          </Button>
        </td>
      </tr>
      {hasSubmitted && expanded && <HistoryPanel history={card.history} />}
    </>
  );
}
