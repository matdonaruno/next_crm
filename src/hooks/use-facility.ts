// src/hooks/use-facility.ts
import { useState, useEffect } from 'react';
import { useSupabase } from '@/app/_providers/supabase-provider';
import type { Database } from '@/types/supabase';

type FacilityRow = Database['public']['Tables']['facilities']['Row'];

export function useFacilityName(facilityId?: string) {
  const { supabase } = useSupabase();

  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    // facilityId が有効な文字列でない場合は処理をスキップ
    if (typeof facilityId !== 'string' || facilityId.trim() === '') {
      if (isMounted) {
        setName('');
        setLoading(false);
      }
      return;
    }

    async function getFacilityName() {
      setLoading(true);
      try {
        const id = facilityId as string; // after earlier guard, this is safe
        // 型を明示的に指定してクエリを構築
        const { data, error } = await supabase
          .from('facilities')
          .select('name')
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        
        if (isMounted) {
          // data が null の場合は空文字をセット
          setName(data?.name ?? '');
        }
      } catch (err) {
        console.error('施設情報の取得エラー:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    getFacilityName();

    return () => {
      isMounted = false;
    };
  }, [supabase, facilityId]);

  return { name, loading, error };
}
