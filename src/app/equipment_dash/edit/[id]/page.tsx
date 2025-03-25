'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/ui/app-header';
import { ChevronLeft, Plus, X, Save, Wrench, Trash } from 'lucide-react';
import { useSessionCheck } from '@/hooks/useSessionCheck';

// 機器データの型定義
interface Equipment {
  id: string;
  name: string;
  description: string | null;
  facility_id: string;
  department_id: string;
  created_at: string;
  updated_at: string;
}

// 点検項目の型定義
interface CheckItem {
  id: string;
  name: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed';
  equipment_id: string;
  created_at: string;
  updated_at: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

export default function EditEquipmentPage() {
  const router = useRouter();
  const params = useParams();
  const equipmentId = params?.id as string;
  
  // 認証と設定
  const { user } = useAuth();
  useSessionCheck(false, []);
  
  // 状態管理（未使用の変数にはアンダースコアを付けて警告を抑制）
  const [_equipment, setEquipment] = useState<Equipment | null>(null);
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentDescription, setEquipmentDescription] = useState('');
  const [_facilityId, setFacilityId] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // 初期データ取得
  useEffect(() => {
    const fetchEquipmentData = async () => {
      if (!user || !equipmentId) return;
      
      setIsLoading(true);
      try {
        // 機器データを取得
        const { data: equipmentData, error: equipmentError } = await supabase
          .from('equipment')
          .select(`
            *,
            departments(id, name)
          `)
          .eq('id', equipmentId)
          .single();
          
        if (equipmentError) throw equipmentError;
        
        if (!equipmentData) {
          setError('指定された機器が見つかりません');
          return;
        }
        
        setEquipment(equipmentData);
        setEquipmentName(equipmentData.name);
        setEquipmentDescription(equipmentData.description || '');
        setFacilityId(equipmentData.facility_id);
        setSelectedDepartmentId(equipmentData.department_id);
        
        // 施設名を取得
        const { data: facilityData, error: facilityError } = await supabase
          .from('facilities')
          .select('name')
          .eq('id', equipmentData.facility_id)
          .single();
          
        if (!facilityError && facilityData) {
          setFacilityName(facilityData.name);
        }
        
        // 部署一覧取得
        const { data: deptData, error: deptError } = await supabase
          .from('departments')
          .select('id, name')
          .eq('facility_id', equipmentData.facility_id)
          .order('name');
          
        if (!deptError && deptData) {
          setDepartments(deptData);
        }
        
        // 点検項目を取得
        const { data: checkItemsData, error: checkItemsError } = await supabase
          .from('equipment_check_items')
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('name');
          
        if (checkItemsError) throw checkItemsError;
        
        setCheckItems(checkItemsData || []);
      } catch (error) {
        console.error('データ取得エラー:', error);
        setError('データの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEquipmentData();
  }, [user, equipmentId]);
  
  // 点検項目の追加
  const addCheckItem = () => {
    const newItem: CheckItem = {
      id: `temp-${Date.now()}`,
      name: '',
      description: '',
      frequency: 'monthly',
      equipment_id: equipmentId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isNew: true
    };
    
    setCheckItems([...checkItems, newItem]);
  };
  
  // 点検項目の削除
  const removeCheckItem = (index: number) => {
    const newItems = [...checkItems];
    
    // 既存の項目の場合は削除フラグを立てる（DBから削除するため）
    if (!newItems[index].isNew) {
      newItems[index] = {
        ...newItems[index],
        isDeleted: true
      };
      setCheckItems(newItems);
    } else {
      // 新規の項目の場合は配列から削除
      newItems.splice(index, 1);
      setCheckItems(newItems);
    }
  };
  
  // 点検項目の更新
  const updateCheckItem = (index: number, field: keyof CheckItem, value: string) => {
    const newItems = [...checkItems];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
      updated_at: new Date().toISOString()
    };
    setCheckItems(newItems);
  };
  
  // 機器更新処理
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
      // 機器情報を更新
      const { error: equipmentError } = await supabase
        .from('equipment')
        .update({
          name: equipmentName,
          description: equipmentDescription,
          department_id: selectedDepartmentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', equipmentId);
        
      if (equipmentError) throw equipmentError;
      
      // 新規追加の点検項目を登録
      const newItems = checkItems.filter(item => item.isNew && !item.isDeleted);
      if (newItems.length > 0) {
        const itemsToInsert = newItems.map(item => ({
          name: item.name,
          description: item.description,
          frequency: item.frequency,
          equipment_id: equipmentId
        }));
        
        const { error: insertError } = await supabase
          .from('equipment_check_items')
          .insert(itemsToInsert);
          
        if (insertError) throw insertError;
      }
      
      // 削除対象の点検項目を削除
      const deletedItems = checkItems.filter(item => !item.isNew && item.isDeleted);
      if (deletedItems.length > 0) {
        const { error: deleteError } = await supabase
          .from('equipment_check_items')
          .delete()
          .in('id', deletedItems.map(item => item.id));
          
        if (deleteError) throw deleteError;
      }
      
      // 更新対象の点検項目を更新
      const updatedItems = checkItems.filter(item => !item.isNew && !item.isDeleted);
      for (const item of updatedItems) {
        const { error: updateError } = await supabase
          .from('equipment_check_items')
          .update({
            name: item.name,
            description: item.description,
            frequency: item.frequency,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);
          
        if (updateError) throw updateError;
      }
      
      // 処理成功
      router.push('/equipment_dash');
    } catch (error) {
      console.error('更新エラー:', error);
      setError('データの更新に失敗しました');
      setIsSubmitting(false);
    }
  };
  
  // 機器削除処理
  const handleDelete = async () => {
    if (!window.confirm('この機器を削除してもよろしいですか？関連する点検項目も全て削除されます。')) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // 機器を削除（外部キー制約により関連する点検項目も自動削除される）
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', equipmentId);
        
      if (error) throw error;
      
      router.push('/equipment_dash');
    } catch (error) {
      console.error('削除エラー:', error);
      setError('機器の削除に失敗しました');
      setIsSubmitting(false);
    }
  };

  // モデル選択の変更ハンドラー
  const handleModelChange = (value: string) => {
    console.log('Selected model:', value);
  };
  
  // 点検項目の追加ボタンハンドラー
  const handleAddCheckItem = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    addCheckItem();
  };
  
  if (isLoading) {
    return <div className="p-4">読み込み中...</div>;
  }
  
  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="機器編集"
        showBackButton={true}
      />
      
      <main className="container max-w-3xl mx-auto py-6 px-4">
        <h1 className="text-2xl font-bold mb-6">機器情報の編集</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="mb-4">
              <Label htmlFor="facilityName" className="block text-sm font-medium text-gray-700 mb-1">施設</Label>
              <Input id="facilityName" value={facilityName} disabled className="bg-gray-100" />
            </div>
            
            <div className="mb-4">
              <Label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">部署</Label>
              <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="部署を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="mb-4">
              <Label htmlFor="equipmentName" className="block text-sm font-medium text-gray-700 mb-1">機器名 *</Label>
              <Input 
                id="equipmentName"
                value={equipmentName}
                onChange={e => setEquipmentName(e.target.value)}
                required
              />
            </div>
            
            <div className="mb-4">
              <Label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">説明</Label>
              <Textarea
                id="description"
                value={equipmentDescription}
                onChange={e => setEquipmentDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          
          {/* 点検項目セクション */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">点検項目</h2>
              <Button 
                type="button"
                onClick={handleAddCheckItem}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                <span>追加</span>
              </Button>
            </div>
            
            {checkItems.length === 0 ? (
              <p className="text-gray-500 text-center py-4">点検項目がありません</p>
            ) : (
              <div className="space-y-4">
                {checkItems.map((item, index) => (
                  !item.isDeleted && (
                    <div key={item.id} className="border rounded-md p-4 relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6"
                        onClick={() => removeCheckItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      
                      <div className="mb-3">
                        <Label htmlFor={`item-name-${index}`} className="block text-sm font-medium text-gray-700 mb-1">項目名 *</Label>
                        <Input
                          id={`item-name-${index}`}
                          value={item.name}
                          onChange={e => updateCheckItem(index, 'name', e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="mb-3">
                        <Label htmlFor={`item-desc-${index}`} className="block text-sm font-medium text-gray-700 mb-1">説明</Label>
                        <Textarea
                          id={`item-desc-${index}`}
                          value={item.description || ''}
                          onChange={e => updateCheckItem(index, 'description', e.target.value)}
                          rows={2}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`item-freq-${index}`} className="block text-sm font-medium text-gray-700 mb-1">頻度</Label>
                        <Select 
                          value={item.frequency} 
                          onValueChange={value => updateCheckItem(index, 'frequency', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="頻度を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">毎日</SelectItem>
                            <SelectItem value="weekly">毎週</SelectItem>
                            <SelectItem value="monthly">毎月</SelectItem>
                            <SelectItem value="as_needed">必要時</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-between mt-6">
            <Button 
              type="button" 
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              <Trash className="h-4 w-4 mr-2" />
              削除
            </Button>
            
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
} 