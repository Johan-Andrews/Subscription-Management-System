const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

let client = null;

function getSupabaseAdmin() {
  if (!client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
    }
    client = createClient(env.SUPABASE_URL || 'https://placeholder.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key', {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return client;
}

module.exports = {
  get auth() {
    return getSupabaseAdmin().auth;
  },
  get client() {
    return getSupabaseAdmin();
  },
};
