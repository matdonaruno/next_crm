// src/components/precision-management/PrecisionManagementRecordForm.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import RecordCard from './RecordCard';
import { Equipment, ImplementationTiming, RecordCardType } from './types';

interface Props {
  departmentId: string;
  equipments: Equipment[];
  timings: ImplementationTiming[];
  onRecordAdded: () => void;
}

export default function PrecisionManagementRecordForm({
  departmentId,
  equipments,
  timings,
  onRecordAdded
}: Props) {
  const { toast } = useToast();

  // ─── フォーム状態 ───
  const [cards, setCards] = useState<RecordCardType[]>([]);
  const [submittedCounts, setSubmittedCounts] = useState<Map<string, number>>(new Map());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingCardId, setSubmittingCardId] = useState<string|null>(null);

  // 初期カード生成
  useEffect(() => {
    const roundTime = (d: Date) => {
      const m = Math.round(d.getMinutes()/15)*15;
      const h = m === 60 ? d.getHours()+1 : d.getHours();
      return `${String(h).padStart(2,'0')}:${String(m===60?0:m).padStart(2,'0')}`;
    };
    setCards(equipments.map(eq => ({
      equipment: eq,
      data: {
        timing_id: null,
        implementation_count: 1,
        error_count: 0,
        shift_trend: false,
        remarks: '',
        implementation_time: roundTime(new Date())
      },
      history: []
    })));
  }, [equipments]);

  // 入力ハンドラ
  const handleInputChange = (
    eid: number,
    field: keyof RecordCardType['data'],
    val: any
  ) => {
    setCards(cs => cs.map(c =>
      c.equipment.pm_equipment_id === eid
        ? { ...c, data: { ...c.data, [field]: val } }
        : c
    ));
  };
  const toggleHistory = (id: string) => setExpandedHistory(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  // 記録送信
  const submitRecord = async (card: RecordCardType) => {
    const id = card.equipment.pm_equipment_id.toString();
    setIsSubmitting(true);
    setSubmittingCardId(id);
    try {
      await fetch('/api/precision-management', {
        method: 'POST',
        body: JSON.stringify({
          ...card.data,
          department_id: departmentId,
          pm_equipment_id: card.equipment.pm_equipment_id
        })
      });
      toast({ title: '登録完了', description: `${card.equipment.equipment_name}を記録しました` });

      const entry = {
        ...card.data,
        timestamp: new Date().toISOString(),
        timing_name:
          timings.find(t => t.timing_id === card.data.timing_id)?.timing_name || ''
      };

      setCards(cs => cs.map(c =>
        c.equipment.pm_equipment_id === card.equipment.pm_equipment_id
          ? { ...c, history: [entry, ...c.history] }
          : c
      ));

      setSubmittedCounts(m => new Map(m).set(id, (m.get(id) || 0) + 1));
      setExpandedHistory(s => new Set(s).add(id));
      handleInputChange(card.equipment.pm_equipment_id, 'timing_id', null);
      onRecordAdded();
    } catch {
      toast({
        title: 'エラー',
        description: '登録に失敗しました',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
      setSubmittingCardId(null);
    }
  };

  const filtered = cards.filter(c =>
    c.equipment.equipment_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <Input
          placeholder="機器名で検索"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <div>
          記録済: {Array.from(submittedCounts.values()).reduce((a, b) => a + b, 0)}件
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>機器名</TableHead>
            <TableHead>タイミング</TableHead>
            <TableHead>時間</TableHead>
            <TableHead>サンプル</TableHead>
            <TableHead>エラー</TableHead>
            <TableHead>シフト/トレンド</TableHead>
            <TableHead>備考</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(card => (
            <RecordCard
              key={card.equipment.pm_equipment_id}
              card={card}
              timings={timings}
              submittedCount={submittedCounts.get(card.equipment.pm_equipment_id.toString()) || 0}
              expanded={expandedHistory.has(card.equipment.pm_equipment_id.toString())}
              isSubmitting={isSubmitting}
              submittingCardId={submittingCardId}
              onToggleHistory={toggleHistory}
              onInputChange={handleInputChange}
              onSubmit={submitRecord}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
