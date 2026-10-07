import { createClient } from '@supabase/supabase-js';

// Set these in .env.local; copy the names from .env.example.
const projectUrl = import.meta.env.VITE_SUPABASE_URL;
// This client-side key must be publishable/anon, never service_role.
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(projectUrl && publishableKey);
export const isLocalDemo = import.meta.env.DEV && !isSupabaseConfigured;
export const supabase = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;