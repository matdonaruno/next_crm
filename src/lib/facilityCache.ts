// 施設データのキャッシュ用ユーティリティ

interface Facility {
  id: string;
  name: string;
}

const CACHE_KEY = 'cached_facility';
const LEGACY_CACHE_KEY = 'facilityCache'; // 古いキャッシュキー

// 施設データをキャッシュに保存
export function cacheFacility(facility: Facility): void {
  try {
    // 新しいフォーマットでキャッシュを保存
    localStorage.setItem(CACHE_KEY, JSON.stringify(facility));
    console.log(`施設データをキャッシュに保存しました: ${facility.name} (${facility.id})`);
    
    // 古いキャッシュキーも念のため更新（sensor-dataページなどで使用）
    localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(facility));
  } catch (error) {
    console.error('施設データのキャッシュ保存に失敗しました:', error);
  }
}

// キャッシュから施設データを取得
export function getCachedFacility(): Facility | null {
  try {
    // 新しいキャッシュを最初に確認
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsedData = JSON.parse(cached);
      console.log(`キャッシュから施設データを取得: ${parsedData.name} (${parsedData.id})`);
      return parsedData;
    }
    
    // 次に古いキャッシュを確認
    const legacyCached = localStorage.getItem(LEGACY_CACHE_KEY);
    if (legacyCached) {
      const parsedLegacyData = JSON.parse(legacyCached);
      console.log(`古いキャッシュから施設データを取得: ${parsedLegacyData.name} (${parsedLegacyData.id})`);
      
      // 新しいキャッシュにも保存しておく
      cacheFacility(parsedLegacyData);
      return parsedLegacyData;
    }
    
    console.log('キャッシュに施設データがありません');
    return null;
  } catch (error) {
    console.error('キャッシュからの施設データ取得に失敗しました:', error);
    return null;
  }
}

// キャッシュをクリア
export function clearFacilityCache(): void {
  try {
    // 両方のキャッシュをクリア
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(LEGACY_CACHE_KEY);
    console.log('施設データのキャッシュをクリアしました');
  } catch (error) {
    console.error('施設データのキャッシュクリアに失敗しました:', error);
  }
} 