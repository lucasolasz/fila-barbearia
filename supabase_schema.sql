-- SQL Schema for BarberQueue
-- Run this in your Supabase SQL Editor

-- 1. Customers Table
create table IF NOT EXISTS public.customers (
  id uuid not null default gen_random_uuid (),
  name text not null,
  phone text not null,
  created_at timestamp with time zone null default now(),
  constraint customers_pkey primary key (id),
  constraint customers_phone_key unique (phone)
) TABLESPACE pg_default;

-- 2. Queue Table
create table IF NOT EXISTS public.queue (
  id uuid not null default gen_random_uuid (),
  code text not null,
  customer_id uuid null,
  position integer not null,
  status text null default 'waiting'::text,
  created_at timestamp with time zone null default now(),
  service_start timestamp with time zone null,
  service_end timestamp with time zone null,
  notified_near boolean null,
  notified_next boolean null default false,
  last_update_sent_at timestamp with time zone null,
  last_sent_eta integer null,
  service_duration integer null default 30,
  parent_queue_id uuid null,
  selected_services text[] null default '{}'::text[],
  last_delay_sent_at timestamp with time zone null,
  constraint queue_pkey primary key (id),
  constraint queue_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE,
  constraint queue_parent_queue_id_fkey foreign KEY (parent_queue_id) references queue (id)
) TABLESPACE pg_default;

-- 3. Services Table (History)
create table IF NOT EXISTS public.services (
  id uuid not null default gen_random_uuid (),
  customer_id uuid null,
  duration_minutes integer not null,
  created_at timestamp with time zone null default now(),
  constraint services_pkey primary key (id),
  constraint services_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete set null
) TABLESPACE pg_default;

-- 4. Barbershop Schedule
create table IF NOT EXISTS public.barbershop_schedule (
  id uuid not null default gen_random_uuid (),
  weekday integer not null,
  open_time time without time zone null,
  close_time time without time zone null,
  is_closed boolean null default false,
  constraint barbershop_schedule_pkey primary key (id),
  constraint barbershop_schedule_weekday_key unique (weekday)
) TABLESPACE pg_default;

-- 5. Schedule Exceptions
create table IF NOT EXISTS public.schedule_exceptions (
  id uuid not null default gen_random_uuid (),
  date date not null,
  open_time time without time zone null,
  close_time time without time zone null,
  is_closed boolean null default false,
  constraint schedule_exceptions_pkey primary key (id),
  constraint schedule_exceptions_date_key unique (date)
) TABLESPACE pg_default;

-- 6. Shop Settings
create table IF NOT EXISTS public.shop_settings (
  id uuid not null default gen_random_uuid (),
  manual_status text null default 'auto'::text,
  updated_at timestamp with time zone null default now(),
  whatsapp_number text null default '+5521999062880'::text,
  theme text null default 'light'::text,
  shop_name text null default 'BarberQueue'::text,
  logo_url text null,
  webhook_url text null,
  tracking_url_base text null,
  base_queue_time smallint null,
  max_queue_time text null,
  constraint shop_settings_pkey primary key (id),
  is_lunch_paused boolean not null default false,
  is_pre_opening boolean not null default false,
  constraint shop_settings_manual_status_check check (
    (
      manual_status = any (array['auto'::text, 'open'::text, 'closed'::text])
    )
  ),
  constraint theme_check check (
    (theme = any (array['light'::text, 'dark'::text]))
  )
) TABLESPACE pg_default;

-- 7. Campaigns Table (rascunhos e enviadas unificados via is_draft)
create table IF NOT EXISTS public.campaigns (
  id uuid not null default gen_random_uuid (),
  title text not null,
  message text not null,
  is_draft boolean not null default false,
  selected_contact_ids text[] null default '{}'::text[],
  recipient_count integer not null default 0,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint campaigns_pkey primary key (id)
) TABLESPACE pg_default;

-- 8. Row Level Security (RLS) Policies
-- Pattern: RLS enabled + full_access policy ALL to anon (matches production)

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_customers" ON public.customers
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_queue" ON public.queue
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_services" ON public.services
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.barbershop_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_schedule" ON public.barbershop_schedule
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_schedule_exceptions" ON public.schedule_exceptions
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_shop_settings" ON public.shop_settings
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_campaigns" ON public.campaigns
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Enable Realtime for Queue table
ALTER PUBLICATION supabase_realtime ADD TABLE queue;
ALTER PUBLICATION supabase_realtime ADD TABLE barbershop_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_exceptions;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_settings;

-- Initial Shop Settings Data
INSERT INTO "public"."shop_settings" ("id", "manual_status", "updated_at", "whatsapp_number", "theme", "shop_name", "logo_url", "webhook_url", "tracking_url_base", "base_queue_time", "max_queue_time") VALUES ('8af2b68d-f970-41b2-b5ef-32b086db69bd', 'auto', '2026-03-29 20:21:17.552291+00', '+5521999062880', 'dark', 'Don Cabellone', 'https://mgvkygjydujtoqubgwmc.supabase.co/storage/v1/object/public/logos/logo-1776533077248.jpg', 'https://n8ndes.ltech.app.br/webhook/notificacao', 'https://www.doncabellone.com.br/', 30, '19:00');

-- Initial Schedule Data
INSERT INTO "public"."barbershop_schedule" ("id", "weekday", "open_time", "close_time", "is_closed") VALUES ('303420a2-bfa2-4be4-83d7-357a7496261f', 3, '09:00:00', '18:00:00', false), ('37f400ad-63a1-4535-ad06-b82ab141b83c', 5, '09:00:00', '18:00:00', false), ('3bec7d66-7b91-45b0-b26f-c3ccf281d4e1', 0, '17:04:00', '22:04:00', true), ('40cbf2d7-d3a7-4f77-9f10-a6bcca7b382d', 2, '09:00:00', '18:00:00', false), ('46d09e45-6176-454d-95fc-e5568a9eb851', 4, '09:00:00', '18:00:00', false), ('c6bb2f17-5df3-4ca3-9bf9-28e0c79383c6', 1, '09:00:00', '19:00:00', true), ('ec0f195f-3a9a-441f-892c-538814970443', 6, '08:00:00', '17:00:00', false);
