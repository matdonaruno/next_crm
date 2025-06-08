"use client";

import { useState, useEffect, useCallback } from "react";
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Papa from 'papaparse';

interface Reagent {
  id: number;
  department: string;
  name: string;
  lotNo: string;
  specification: string;
  unit: string;
  expirationDate: string;
  registrationDate: string;
  registeredBy: { fullname: string } | string;
  used: boolean;
  used_at: string | null;
  ended_at: string | null;
  used_by?: { fullname: string } | string | null;
  ended_by?: { fullname: string } | string | null;
  items?: ReagentItem[];
}

interface ReagentItem {
  id: number;
  name: string;
  usagestartdate: string;
  user: string;
  user_fullname?: string;
  created_at: string;
  reagent_package_id: number;
  ended_at?: string;
  ended_by?: string;
  ended_by_fullname?: string;
}

interface ReagentMaster {
  code: string;
  name: string;
}

export function useReagentsDashboard(facilityId: string | undefined) {
  const supabase = useSupabaseClient();
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [items, setItems] = useState<ReagentItem[]>([]);
  const [master, setMaster] = useState<Record<string, ReagentMaster>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMaster = useCallback(async () => {
    const res = await fetch('/products.csv');
    const text = await res.text();
    return new Promise<Record<string, ReagentMaster>>((resolve) => {
      Papa.parse(text, {
        header: true,
        complete: ({ data }) => {
          const m: Record<string, ReagentMaster> = {};
          (data as any[]).forEach(r => {
            if (r.code) m[r.code] = { code: r.code, name: r.name };
          });
          resolve(m);
        }
      });
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    try {
      const masterData = await loadMaster();
      setMaster(masterData);

      const { data: reagentsData, error: reagentsError } = await supabase
        .from('reagents')
        .select(`*, registeredBy(fullname), used_by(fullname), ended_by(fullname)`)
        .eq('facility_id', facilityId)
        .order('registrationDate', { ascending: false });
      if (reagentsError) throw reagentsError;
      setReagents(reagentsData || []);

      const { data: itemsData, error: itemsError } = await supabase
        .from('reagent_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (itemsError) throw itemsError;
      setItems(itemsData || []);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [facilityId, loadMaster, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { reagents, items, master, loading, error };
}