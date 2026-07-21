/* Supabase auth wrapper — Google/Facebook sign-in, one shared session for
   both the senior/ and wedding/ sites (same Supabase project, same cookies
   scope once this all lives under one domain). Loaded as an ES module. */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://iaoejcsohwentsyqryyp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6jtARcxZm8m4XzQB80MB4Q_MNAxsleB';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function notify(message) {
  if (window.showToast) {
    window.showToast(message);
  } else {
    alert(message);
  }
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) notify(`Google sign-in error: ${error.message}`);
  return { error };
}

export async function signInWithFacebook() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo: window.location.href },
  });
  if (error) notify(`Facebook sign-in error: ${error.message}`);
  return { error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) notify(`Sign-out error: ${error.message}`);
  return { error };
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
