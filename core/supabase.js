// core/supabase.js
// Centrale database connectie — wordt gedeeld door alle modules.
// Gebruik: const supabase = require('../../core/supabase');

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('FOUT: SUPABASE_URL en SUPABASE_SERVICE_KEY ontbreken in .env');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = supabase;
