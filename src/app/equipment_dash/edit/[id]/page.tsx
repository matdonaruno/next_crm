'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AppHeader } from '@/components/ui/app-header';
import { ChevronLeft, Plus, X, Save, Trash } from 'lucide-react';
import { useSupabase } from '@/app/_providers/supabase-provider';

interface Equipment {
  id: string;
  name: string;
  description: string | null;
  facility_id: string;
  department_id: string;
  model_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CheckItem {
  id: string;
  name: string;
  description: string | null;
  frequency: string;             // supabase からは文字列（enum）で来るので string に
  equipment_id: string;
  created_at: string | null;
  updated_at: string | null;
  isNew?: boolean;
  isDeleted?: boolean;
}

export default function EditEquipmentPage() {
  const router = useRouter();
  const { id: equipmentId } = useParams() as { id: string };

  const { supabase, session } = useSupabase();
  const user = session?.user;

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentDescription, setEquipmentDescription] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 機器データ取得
        const { data: eqData, error: eqErr } = await supabase
          .from('equipment')
          .select('*, departments(id,name)')
          .eq('id', equipmentId)
          .single();
        if (eqErr || !eqData) throw eqErr || new Error('機器が見つかりません');

        // 必要なフィールドだけ抽出
        const eq: Equipment = {
          id: eqData.id,
          name: eqData.name,
          description: eqData.description,
          facility_id: eqData.facility_id,
          department_id: eqData.department_id,
          model_id: eqData.model_id,
          created_at: eqData.created_at,
          updated_at: eqData.updated_at,
        };
        setEquipment(eq);
        setEquipmentName(eq.name);
        setEquipmentDescription(eq.description ?? '');
        setSelectedDepartmentId(eq.department_id);

        // 施設名取得
        const { data: fac } = await supabase
          .from('facilities')
          .select('name')
          .eq('id', eq.facility_id)
          .single();
        if (fac) setFacilityName(fac.name);

        // 部署一覧取得
        const { data: deptList } = await supabase
          .from('departments')
          .select('id, name')
          .eq('facility_id', eq.facility_id)
          .order('name');
        if (deptList) setDepartments(deptList);

        // 点検項目取得
        const { data: items } = await supabase
          .from('equipment_check_items')
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('name');
        setCheckItems(
          (items || []).map((it: any) => ({
            id: it.id,
            name: it.name,
            description: it.description,
            frequency: it.frequency ?? '',
            equipment_id: it.equipment_id,
            created_at: it.created_at,
            updated_at: it.updated_at,
          }))
        );

      } catch (e: any) {
        console.error(e);
        setError(e.message || 'データ取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, equipmentId]);

  const addCheckItem = () => {
    setCheckItems([
      ...checkItems,
      {
        id: `new-${Date.now()}`,
        name: '',
        description: '',
        frequency: 'monthly',
        equipment_id: equipmentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isNew: true,
      },
    ]);
  };

  const removeCheckItem = (index: number) => {
    const list = [...checkItems];
    if (!list[index].isNew) {
      list[index].isDeleted = true;
    } else {
      list.splice(index, 1);
    }
    setCheckItems(list);
  };

  const updateCheckItem = (index: number, field: keyof CheckItem, value: string) => {
    const list = [...checkItems];
    list[index] = {
      ...list[index],
      [field]: value,
      updated_at: new Date().toISOString(),
    };
    setCheckItems(list);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentName.trim()) { setError('機器名を入力してください'); return; }
    if (!selectedDepartmentId) { setError('部署を選択してください'); return; }

    setIsSubmitting(true);
    try {
      // 機器更新
      const { error: updErr } = await supabase
        .from('equipment')
        .update({
          name: equipmentName,
          description: equipmentDescription,
          department_id: selectedDepartmentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', equipmentId);
      if (updErr) throw updErr;

      // 新規項目追加
      const toInsert = checkItems.filter((c) => c.isNew && !c.isDeleted);
      if (toInsert.length) {
        await supabase
          .from('equipment_check_items')
          .insert(
            toInsert.map((c) => ({
              name: c.name,
              description: c.description,
              frequency: c.frequency,
              equipment_id: equipmentId,
            }))
          );
      }

      // 削除項目
      const toDelete = checkItems.filter((c) => !c.isNew && c.isDeleted).map((c) => c.id);
      if (toDelete.length) {
        await supabase.from('equipment_check_items').delete().in('id', toDelete);
      }

      // 既存項目更新
      const toUpdate = checkItems.filter((c) => !c.isNew && !c.isDeleted);
      for (const c of toUpdate) {
        await supabase
          .from('equipment_check_items')
          .update({
            name: c.name,
            description: c.description,
            frequency: c.frequency,
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id);
      }

      router.push('/equipment_dash');
    } catch (e: any) {
      console.error(e);
      setError('更新に失敗しました');
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('本当に削除しますか？')) return;
    setIsSubmitting(true);
    try {
      await supabase.from('equipment').delete().eq('id', equipmentId);
      router.push('/equipment_dash');
    } catch (e) {
      console.error(e);
      setError('削除に失敗しました');
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-4">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="機器編集" showBackButton />
      <main className="container max-w-3xl mx-auto py-6 px-4">
        <h1 className="text-2xl font-bold mb-6">機器情報編集</h1>
        {error && <div className="bg-red-100 p-3 mb-4 rounded text-red-700">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="bg-white p-6 mb-6 rounded shadow">
            <Label className="block mb-1">施設</Label>
            <Input value={facilityName} readOnly className="bg-gray-100 mb-4" />

            <Label className="block mb-1">部署</Label>
            <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
              <SelectTrigger className="w-full mb-4"><SelectValue placeholder="選択してください" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Label className="block mb-1">機器名 *</Label>
            <Input
              value={equipmentName}
              onChange={(e) => setEquipmentName(e.target.value)}
              required
              className="mb-4"
            />

            <Label className="block mb-1">説明</Label>
            <Textarea
              value={equipmentDescription}
              onChange={(e) => setEquipmentDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="bg-white p-6 mb-6 rounded shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">点検項目</h2>
              <Button size="sm" variant="outline" onClick={addCheckItem}>
                <Plus className="w-4 h-4 mr-1" /> 追加
              </Button>
            </div>
            {checkItems.length === 0 ? (
              <p className="text-center text-gray-500">項目がありません</p>
            ) : (
              <div className="space-y-4">
                {checkItems.map((c, i) => !c.isDeleted && (
                  <div key={c.id} className="p-4 border rounded relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => removeCheckItem(i)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Label className="block mb-1">項目名 *</Label>
                    <Input
                      value={c.name}
                      onChange={(e) => updateCheckItem(i, 'name', e.target.value)}
                      required
                      className="mb-3"
                    />
                    <Label className="block mb-1">説明</Label>
                    <Textarea
                      value={c.description ?? ''}
                      onChange={(e) => updateCheckItem(i, 'description', e.target.value)}
                      rows={2}
                      className="mb-3"
                    />
                    <Label className="block mb-1">頻度</Label>
                    <Select
                      value={c.frequency}
                      onValueChange={(v) => updateCheckItem(i, 'frequency', v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">毎日</SelectItem>
                        <SelectItem value="weekly">毎週</SelectItem>
                        <SelectItem value="monthly">毎月</SelectItem>
                        <SelectItem value="as_needed">必要時</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              <Trash className="w-4 h-4 mr-1" /> 削除
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-primary">
              <Save className="w-4 h-4 mr-1" /> {isSubmitting ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
