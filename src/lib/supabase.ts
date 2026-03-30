import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseUrl = (rawUrl && !rawUrl.includes('your-project') && rawUrl !== 'undefined') 
  ? rawUrl 
  : 'https://cvyhwjhkoikzophdbkxs.supabase.co';

const supabaseAnonKey = (rawKey && !rawKey.includes('your-anon-key') && rawKey !== 'undefined') 
  ? rawKey 
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2eWh3amhrb2lrem9waGRia3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTI2ODcsImV4cCI6MjA4OTA4ODY4N30.pC8EbTsgx9fopK2h01bvyiangy2Iyr_BXS25gYGna5c';

const isValidUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const isPlaceholder = (val: string) => {
  return !val || val.includes('YOUR_') || val.includes('TODO_') || val === 'undefined';
};

let _supabase: any = null;

export const supabase = new Proxy({} as any, {
  get(target, prop) {
    if (!_supabase) {
      if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey) || !isValidUrl(supabaseUrl)) {
        throw new Error(
          'Supabase credentials missing or invalid. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Secrets panel with valid values from your Supabase project.'
        );
      }
      _supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    return _supabase[prop];
  }
});

export type Customer = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
};

export type QueueItem = {
  id: string;
  code: string;
  customer_id: string;
  position: number;
  status: 'waiting' | 'serving' | 'completed' | 'cancelled';
  created_at: string;
  service_start?: string;
  service_end?: string;
  customer?: Customer;
};

export type Service = {
  id: string;
  customer_id: string;
  duration_minutes: number;
  created_at: string;
};

export type Schedule = {
  id: string;
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

export type ScheduleException = {
  id: string;
  date: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

export type ShopSettings = {
  id: string;
  manual_status: 'auto' | 'open' | 'closed';
  whatsapp_number: string;
  theme: 'light' | 'dark';
  shop_name: string;
  logo_url: string | null;
  updated_at: string;
};
