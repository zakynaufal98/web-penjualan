import { createClient } from '@supabase/supabase-js';

// These should normally be in .env, but for demonstration we'll use placeholder or if provided by user.
// Assuming user will provide or use a mock if they don't have it.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
