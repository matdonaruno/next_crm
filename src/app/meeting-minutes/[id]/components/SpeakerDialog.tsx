'use client';
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  speakers: Speaker[];
  onAddSpeaker: (name: string) => void;
}

export default function SpeakerDialog({
  open,
  onOpenChange,
  speakers,
  onAddSpeaker,
}: Props) {
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (newName.trim()) {
      onAddSpeaker(newName.trim());
      setNewName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>話者設定</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">既存の話者</h3>
            <ul className="list-disc pl-5 mt-2">
              {speakers.map(s => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-medium">新しい話者を追加</h3>
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 border px-2 py-1 rounded"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="名前を入力"
              />
              <Button onClick={handleAdd}>追加</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
