import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cvyhwjhkoikzophdbkxs.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2eWh3amhrb2lrem9waGRia3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTI2ODcsImV4cCI6MjA4OTA4ODY4N30.pC8EbTsgx9fopK2h01bvyiangy2Iyr_BXS25gYGna5c';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: q } = await supabase.from('queue').select('*').limit(1);
  console.log('queue:', q);
  const { data: s } = await supabase.from('shop_settings').select('*').limit(1);
  console.log('shop_settings:', s);
}
check();
