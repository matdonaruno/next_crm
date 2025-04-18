import { useState, useEffect } from 'react';
import supabase from '@/lib/supabaseClient';

interface Facility {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  // 必要に応じて他のフィールドを追加
}

export function useFacility() {
  const [facility, setFacility] = useState<Facility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function getFacility() {
      try {
        setLoading(true);
        
        // シンプルに施設一覧を取得
        const { data, error } = await supabase
          .from('facilities')
          .select('*')
          .limit(1);
          
        if (error) throw error;
        
        // 最初の施設を使用
        setFacility(data && data.length > 0 ? data[0] : null);
      } catch (err) {
        console.error('施設情報の取得エラー:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    }

    getFacility();
  }, []);

  return { facility, loading, error };
} 