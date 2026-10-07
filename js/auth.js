import { isLocalDemo, isSupabaseConfigured, supabase } from './supabase-client.js';

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function ensureAnonymousSession() {
  if (!supabase) throw new Error('Supabase is not configured.');
  const existingUser = await getCurrentUser();
  if (existingUser) return existingUser;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

export function hasRole(user, role) {
  if (!isSupabaseConfigured && isLocalDemo) return true;
  return user?.app_metadata?.role === role;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Authentication is not configured yet.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function requestPasswordReset(email) {
  if (!supabase) throw new Error('Authentication is not configured yet.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset-password=1`
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  if (!supabase) throw new Error('Authentication is not configured yet.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

export async function signUp(email, password) {
  if (!supabase) throw new Error('Authentication is not configured yet.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw error;
  if (data.session) await supabase.auth.signOut();
  return data;
}