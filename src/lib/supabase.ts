import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const apiKey = import.meta.env.VITE_SUPABASE_API_KEY;

export const supabaseUrl = rawUrl;

const supabaseAnonKey = apiKey;

const isValidUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const isPlaceholder = (val: string) => {
  return (
    !val ||
    val.includes("YOUR_") ||
    val.includes("TODO_") ||
    val === "undefined"
  );
};

let _supabase: any = null;

export const supabase = new Proxy({} as any, {
  get(target, prop) {
    if (!_supabase) {
      if (
        isPlaceholder(supabaseUrl) ||
        isPlaceholder(supabaseAnonKey) ||
        !isValidUrl(supabaseUrl)
      ) {
        throw new Error(
          "Supabase credentials missing or invalid. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_API_KEY in the Secrets panel with valid values from your Supabase project.",
        );
      }
      _supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    return _supabase[prop];
  },
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
  status: "waiting" | "serving" | "completed" | "cancelled";
  created_at: string;
  service_start?: string;
  service_end?: string;
  customer?: Customer;
  service_duration?: number;
  parent_queue_id?: string;
  selected_services?: string[];
  is_manual?: boolean;
  notified_near?: boolean;
  notified_next?: boolean;
  last_update_sent_at?: string;
  last_sent_eta?: number;
  last_delay_sent_at?: string;
};

export type Campaign = {
  id: string;
  title: string;
  message: string;
  is_draft: boolean;
  selected_contact_ids: string[];
  recipient_count: number;
  created_at: string;
  updated_at: string;
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
  manual_status: "auto" | "open" | "closed";
  whatsapp_number: string;
  theme: "light" | "dark";
  shop_name: string;
  logo_url: string | null;
  updated_at: string;
  is_lunch_paused?: boolean;
  is_pre_opening?: boolean;
};
