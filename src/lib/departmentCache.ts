// 部署データのキャッシュ用ユーティリティ

interface Department {
  id: string;
  name: string;
  facility_id?: string;
}

const CACHE_KEY = 'cached_departments';

// 部署データをキャッシュに保存
export function cacheDepartments(departments: Department[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(departments));
  } catch (error) {
    console.error('部署データのキャッシュ保存に失敗しました:', error);
  }
}

// キャッシュから部署データを取得
export function getCachedDepartments(): Department[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('キャッシュからの部署データ取得に失敗しました:', error);
    return null;
  }
}

// キャッシュをクリア
export function clearDepartmentCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('部署データのキャッシュクリアに失敗しました:', error);
  }
} 