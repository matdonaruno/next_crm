'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useSupabase } from '@/app/_providers/supabase-provider';
import { AppHeader } from '@/components/ui/app-header';
import { ChevronLeft, Plus, X, Save } from 'lucide-react';

/* -------------------------------------------------- */
/* 型定義                                              */
/* -------------------------------------------------- */
interface CheckItem {
  id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed';
  isNew?: boolean;
}

/* ================================================== */
/* ページ本体                                          */
/* ================================================== */
function EquipmentPageContent() {
  const router       = useRouter();
  const params       = useSearchParams();

  /* 検索パラメータは null の可能性があるので '' でフォールバック */
  const defaultDeptId   = params?.get('departmentId') ?? '';
  const defaultDeptName = params?.get('department')   ?? '';

  const { supabase, session } = useSupabase();
  const user = session?.user;

  /* ---------------- state ---------------- */
  const [facilityId,  setFacilityId]  = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(defaultDeptId);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const [equipmentName,        setEquipmentName]        = useState('');
  const [equipmentDescription, setEquipmentDescription] = useState('');

  const [checkItems,   setCheckItems]   = useState<CheckItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,        setError]        = useState('');

  /* -------------------------------------------------- */
  /* 初期データ取得                                     */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        /* プロファイル（facility_id, facilities.name） */
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('facility_id, facilities(name)')
          .eq('id', user.id)
          .single();

        if (profErr || !prof) throw profErr ?? new Error('プロフィール取得失敗');

        setFacilityId(prof.facility_id ?? '');

        /* ---- facilities(name) は 1:1 関連なのでオブジェクトで返る ---- */
        const facName =
          // Supabase 型は { name:string } | null のためそのまま参照
          (prof as { facilities: { name: string } | null }).facilities?.name ?? '';
        setFacilityName(facName);

        /* 部署一覧 */
        const { data: depts, error: deptErr } = await supabase
          .from('departments')
          .select('id, name')
          .eq('facility_id', prof.facility_id ?? '')   // ★ facility_id が null なら空文字
          .order('name');

        if (deptErr) throw deptErr;
        setDepartments(depts || []);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? '初期データ取得に失敗しました');
      }
    })();
  }, [user]);

  /* -------------------------------------------------- */
  /* 点検項目ハンドラ                                   */
  /* -------------------------------------------------- */
  const addCheckItem = () =>
    setCheckItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: '',
        description: '',
        frequency: 'monthly',
        isNew: true,
      },
    ]);

  const removeCheckItem = (idx: number) =>
    setCheckItems((prev) => prev.filter((_, i) => i !== idx));

  const updateCheckItem = (
    idx: number,
    field: keyof CheckItem,
    val: string,
  ) =>
    setCheckItems((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: val } : c)),
    );

  /* -------------------------------------------------- */
  /* submit                                             */
  /* -------------------------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!equipmentName.trim()) {
      setError('機器名を入力してください');
      return;
    }
    if (!selectedDepartmentId) {
      setError('部署を選択してください');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      /* 機器登録 */
      const { data: newEq, error: eqErr } = await supabase
        .from('equipment')
        .insert({
          name:          equipmentName,
          description:   equipmentDescription,
          facility_id:   facilityId,
          department_id: selectedDepartmentId,
        })
        .select()
        .single();

      if (eqErr || !newEq) throw eqErr ?? new Error('機器登録失敗');

      /* 点検項目登録（存在する場合のみ） */
      if (checkItems.length) {
        const payload = checkItems.map((c) => ({
          name:         c.name,
          description:  c.description,
          frequency:    c.frequency,
          equipment_id: newEq.id,
        }));

        const { error: ciErr } = await supabase
          .from('equipment_check_items')
          .insert(payload);

        if (ciErr) throw ciErr;
      }

      router.push('/equipment_dash');
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? '登録に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* -------------------------------------------------- */
  /*  JSX                                               */
  /* -------------------------------------------------- */
  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="新規機器登録" showBackButton />

      <main className="container py-6 max-w-4xl mx-auto px-4">
        <div className="mb-6 flex items-center">
          <Button variant="ghost" onClick={() => router.back()} className="mr-3">
            <ChevronLeft className="w-5 h-5 mr-1" />
            戻る
          </Button>
          <h1 className="text-2xl font-bold">新規機器登録</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-6">
            {error}
          </div>
        )}

        {/* ---------------- フォーム ---------------- */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ---- 基本情報 ---- */}
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">基本情報</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>施設</Label>
                <Input value={facilityName} readOnly className="bg-gray-50" />
              </div>

              <div>
                <Label>部署</Label>
                <Select
                  value={selectedDepartmentId}
                  onValueChange={setSelectedDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={defaultDeptName || '部署を選択'} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4">
              <Label>機器名 *</Label>
              <Input
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                required
              />
            </div>

            <div className="mt-4">
              <Label>説明</Label>
              <Textarea
                value={equipmentDescription}
                onChange={(e) => setEquipmentDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* ---- 点検項目 ---- */}
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">点検項目</h2>
              <Button type="button" variant="outline" size="sm" onClick={addCheckItem}>
                <Plus className="w-4 h-4 mr-1" />
                追加
              </Button>
            </div>

            {checkItems.length === 0 ? (
              <p className="text-center text-gray-500">点検項目が登録されていません</p>
            ) : (
              <div className="space-y-4">
                {checkItems.map((item, idx) => (
                  <div key={item.id} className="relative border rounded-lg p-4">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2"
                      onClick={() => removeCheckItem(idx)}
                    >
                      <X className="w-4 h-4" />
                    </Button>

                    <Label className="block mb-1">項目名 *</Label>
                    <Input
                      value={item.name}
                      onChange={(e) => updateCheckItem(idx, 'name', e.target.value)}
                      required
                      className="mb-3"
                    />

                    <Label className="block mb-1">説明</Label>
                    <Textarea
                      value={item.description}
                      onChange={(e) =>
                        updateCheckItem(idx, 'description', e.target.value)
                      }
                      rows={2}
                      className="mb-3"
                    />

                    <Label className="block mb-1">頻度</Label>
                    <Select
                      value={item.frequency}
                      onValueChange={(v) => updateCheckItem(idx, 'frequency', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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

          {/* ---- ボタン ---- */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-1" />
              {isSubmitting ? '登録中…' : '登録'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

/* ================================================== */
/*  レンダリングラッパー (Suspense 対応)               */
/* ================================================== */
export default function NewEquipmentPage() {
  return (
    <Suspense fallback={<div className="p-4">読み込み中…</div>}>
      <EquipmentPageContent />
    </Suspense>
  );
}
