// src/hooks/use-user-profile.ts
import { useState, useEffect } from 'react';
import type { Database } from '@/types/supabase';
import { useSupabase } from '@/app/_providers/supabase-provider';

// supabase の profiles テーブルの Row 型
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export function useUserProfile() {
  const { supabase, session } = useSupabase();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (!isMounted) return;

        if (fetchError) {
          setError(new Error(fetchError.message));
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (err: unknown) {
        if (isMounted) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [session, supabase]);

  return { profile, loading, error };
}