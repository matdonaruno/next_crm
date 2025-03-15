// 施設データのキャッシュ用ユーティリティ

interface Facility {
  id: string;
  name: string;
}

const CACHE_KEY = 'cached_facility';

// 施設データをキャッシュに保存
export function cacheFacility(facility: Facility): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(facility));
  } catch (error) {
    console.error('施設データのキャッシュ保存に失敗しました:', error);
  }
}

// キャッシュから施設データを取得
export function getCachedFacility(): Facility | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('キャッシュからの施設データ取得に失敗しました:', error);
    return null;
  }
}

// キャッシュをクリア
export function clearFacilityCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('施設データのキャッシュクリアに失敗しました:', error);
  }
} 