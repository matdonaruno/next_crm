import supabaseBrowser from '../supabaseBrowser';

/**
 * Singleton Supabase client for browser side.
 * Use `import { supabaseClient } from '@/lib/supabase/client'`
 * instead of instantiating a new client in each module.
 */
export const supabaseClient = supabaseBrowser; // supabaseBrowser is already a client instance

export default supabaseClient;