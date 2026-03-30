-- SQL Schema for BarberQueue
-- Run this in your Supabase SQL Editor

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Queue Table
CREATE TABLE IF NOT EXISTS queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  status TEXT DEFAULT 'waiting', -- 'waiting', 'serving', 'completed', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now(),
  service_start TIMESTAMPTZ,
  service_end TIMESTAMPTZ
);

-- 3. Services Table (History)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Barbershop Schedule
CREATE TABLE IF NOT EXISTS barbershop_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday INTEGER NOT NULL UNIQUE, -- 0 (Sunday) to 6 (Saturday)
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false
);

-- 5. Schedule Exceptions
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false
);

-- 6. Shop Settings
CREATE TABLE IF NOT EXISTS shop_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT DEFAULT '+5521999062880',
  theme TEXT DEFAULT 'light',
  shop_name TEXT DEFAULT 'BarberQueue',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Initial Shop Settings Data
INSERT INTO shop_settings (whatsapp_number, theme, shop_name)
SELECT '+5521999062880', 'light', 'BarberQueue'
WHERE NOT EXISTS (SELECT 1 FROM shop_settings)
LIMIT 1;

-- Initial Schedule Data
INSERT INTO barbershop_schedule (weekday, open_time, close_time, is_closed) VALUES
(0, NULL, NULL, true),
(1, '09:00', '19:00', false),
(2, '09:00', '19:00', false),
(3, '09:00', '19:00', false),
(4, '09:00', '19:00', false),
(5, '09:00', '19:00', false),
(6, '09:00', '14:00', false)
ON CONFLICT (weekday) DO NOTHING;

-- Enable Realtime for Queue table
ALTER PUBLICATION supabase_realtime ADD TABLE queue;
ALTER PUBLICATION supabase_realtime ADD TABLE barbershop_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_exceptions;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_settings;

-- STORAGE POLICIES (Run these to fix upload errors)
-- Note: Replace 'logos' with your bucket name if different

-- 1. Allow public uploads to 'logos' bucket
-- CREATE POLICY "Public Upload" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'logos');

-- 2. Allow public reads from 'logos' bucket
-- CREATE POLICY "Public Read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'logos');
