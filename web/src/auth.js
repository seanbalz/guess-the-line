import { createClient } from '@supabase/supabase-js';
import './invitations';

const configuredUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
export const cloudRequested = Boolean(configuredUrl || publishableKey);
export const passwordRecoveryRequested = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
export let configurationError = '';
export let supabaseUrl = '';

if (cloudRequested) {
  if (!configuredUrl || !publishableKey) {
    configurationError = 'Online setup is incomplete. Both the Supabase URL and publishable key must be configured.';
  } else {
    try {
      const url = new URL(configuredUrl);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
        throw new Error('Invalid project URL');
      }
      if (!publishableKey.startsWith('sb_publishable_')) throw new Error('A publishable key is required');
      supabaseUrl = url.origin;
    } catch {
      configurationError = 'Online setup needs a valid Supabase project URL and publishable key. Ask the app owner to check the configuration.';
    }
  }
}

export const cloudEnabled = cloudRequested && !configurationError;
export const supabase = cloudEnabled ? createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
