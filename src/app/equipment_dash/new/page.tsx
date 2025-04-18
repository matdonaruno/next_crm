'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/ui/app-header';
import { ChevronLeft, Plus, X, Save, Wrench } from 'lucide-react';
import { useSessionCheck } from '@/hooks/useSessionCheck';

// 点検項目の型定義
interface CheckItem {
  id: string; // 新規の場合は一時的なID
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed';
  isNew?: boolean;
}

// SearchParamsを取得するコンポーネント
function EquipmentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  
  // 認証と設定
  const { user } = useAuth();
  useSessionCheck(false, []);
  
  // 状態管理
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentDescription, setEquipmentDescription] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentId);
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // 初期データ取得
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      
      try {
        // ユーザープロファイル取得（施設IDの確認）
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('facility_id, facilities(name)')
          .eq('id', user.id)
          .single();
          
        if (profileError) throw profileError;
        
        if (profileData) {
          setFacilityId(profileData.facility_id);
          setFacilityName(profileData.facilities?.name || '');
          
          // 部署一覧取得
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id, name')
            .eq('facility_id', profileData.facility_id)
            .order('name');
            
          if (deptError) throw deptError;
          
          setDepartments(deptData || []);
        }
      } catch (error) {
        console.error('初期データ取得エラー:', error);
        setError('初期データの取得に失敗しました');
      }
    };
    
    fetchInitialData();
  }, [user]);
  
  // 点検項目の追加
  const addCheckItem = () => {
    const newItem: CheckItem = {
      id: `temp-${Date.now()}`,
      name: '',
      description: '',
      frequency: 'monthly',
      isNew: true
    };
    
    setCheckItems([...checkItems, newItem]);
  };
  
  // 点検項目の削除
  const removeCheckItem = (index: number) => {
    const newItems = [...checkItems];
    newItems.splice(index, 1);
    setCheckItems(newItems);
  };
  
  // 点検項目の更新
  const updateCheckItem = (index: number, field: keyof CheckItem, value: string) => {
    const newItems = [...checkItems];
    newItems[index] = {
      ...newItems[index],
      [field]: value
    };
    setCheckItems(newItems);
  };
  
  // 機器登録処理
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
      // 機器を登録
      const { data: equipmentData, error: equipmentError } = await supabase
        .from('equipment')
        .insert({
          name: equipmentName,
          description: equipmentDescription,
          facility_id: facilityId,
          department_id: selectedDepartmentId
        })
        .select()
        .single();
        
      if (equipmentError) throw equipmentError;
      
      if (equipmentData && checkItems.length > 0) {
        // 点検項目を登録
        const checkItemsToInsert = checkItems.map(item => ({
          name: item.name,
          description: item.description,
          frequency: item.frequency,
          equipment_id: equipmentData.id
        }));
        
        const { error: checkItemsError } = await supabase
          .from('equipment_check_items')
          .insert(checkItemsToInsert);
          
        if (checkItemsError) throw checkItemsError;
      }
      
      alert('機器を登録しました');
      router.push('/equipment_dash');
    } catch (error) {
      console.error('機器登録エラー:', error);
      setError('機器の登録に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="新規機器登録"
        showBackButton={true}
      />
      
      <main className="container py-6 max-w-4xl px-4">
        <div className="mb-6 flex items-center">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mr-4"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            戻る
          </Button>
          <h1 className="text-2xl font-bold">新規機器登録</h1>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">基本情報</h2>
            
            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="facilityName">施設名</Label>
                  <Input
                    id="facilityName"
                    value={facilityName}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
                
                <div>
                  <Label htmlFor="department">部署</Label>
                  <Select
                    value={selectedDepartmentId}
                    onValueChange={setSelectedDepartmentId}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder="部署を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(dept => (
                        <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="equipmentName">機器名 *</Label>
                <Input
                  id="equipmentName"
                  value={equipmentName}
                  onChange={(e) => setEquipmentName(e.target.value)}
                  placeholder="機器名を入力"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="equipmentDescription">説明</Label>
                <Textarea
                  id="equipmentDescription"
                  value={equipmentDescription}
                  onChange={(e) => setEquipmentDescription(e.target.value)}
                  placeholder="機器の説明を入力"
                  rows={3}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">点検項目</h2>
              <Button 
                type="button"
                variant="outline"
                onClick={addCheckItem}
                className="flex items-center"
              >
                <Plus className="h-4 w-4 mr-1" />
                点検項目を追加
              </Button>
            </div>
            
            {checkItems.length === 0 ? (
              <p className="text-center py-6 text-gray-500">点検項目が登録されていません</p>
            ) : (
              <div className="space-y-4">
                {checkItems.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-4 relative">
                    <button
                      type="button"
                      onClick={() => removeCheckItem(index)}
                      className="absolute top-2 right-2 p-1 rounded-full bg-gray-100 hover:bg-gray-200"
                    >
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                    
                    <div className="grid gap-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                          <Label htmlFor={`itemName-${index}`}>点検項目名 *</Label>
                          <Input
                            id={`itemName-${index}`}
                            value={item.name}
                            onChange={(e) => updateCheckItem(index, 'name', e.target.value)}
                            placeholder="点検項目名を入力"
                            required
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <Label htmlFor={`itemFrequency-${index}`}>点検頻度</Label>
                          <Select 
                            value={item.frequency} 
                            onValueChange={(value) => updateCheckItem(index, 'frequency', value)}
                          >
                            <SelectTrigger id={`itemFrequency-${index}`}>
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
                      </div>
                      
                      <div>
                        <Label htmlFor={`itemDescription-${index}`}>説明</Label>
                        <Textarea
                          id={`itemDescription-${index}`}
                          value={item.description || ''}
                          onChange={(e) => updateCheckItem(index, 'description', e.target.value)}
                          placeholder="点検項目の説明を入力"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-4">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
            >
              {isSubmitting ? '登録中...' : '機器を登録'}
              {!isSubmitting && <Save className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

// メインのページコンポーネント
export default function NewEquipmentPage() {
  return (
    <Suspense fallback={<div className="p-4">読み込み中...</div>}>
      <EquipmentPageContent />
    </Suspense>
  );
} 