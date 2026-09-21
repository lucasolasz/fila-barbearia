-- ============================================================
-- migration-manual.sql
-- ============================================================
-- Trilha incremental de mudanças no banco que precisam ser
-- aplicadas manualmente em produção via SQL Editor do Supabase.
--
-- Regras:
-- - Append-only: nunca reescrever blocos anteriores.
-- - Cada bloco datado (DD/MM/YYYY) + descrição curta.
-- - SQL idempotente quando possível (IF NOT EXISTS, DROP IF EXISTS).
-- - Estado-alvo completo permanece em supabase_schema.sql.
-- ============================================================


-- =====================================
-- Migração 20/05/2026 — Trim espaços em customers.name
-- =====================================
BEGIN;

UPDATE public.customers
SET name = TRIM(name)
WHERE name <> TRIM(name);

COMMIT;


-- =====================================
-- Migração 20/05/2026 — Coluna is_manual na tabela queue
-- =====================================
ALTER TABLE public.queue
  ADD COLUMN IF NOT EXISTS is_manual boolean default false;


-- =====================================
-- Migração 30/06/2026 — Pré-abertura automática (minutos antes da abertura)
-- =====================================
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS pre_opening_minutes smallint not null default 0;


-- =====================================
-- Migração 09/07/2026 — Pré-abertura por dia (semanal + exceções)
-- =====================================
ALTER TABLE public.barbershop_schedule
  ADD COLUMN IF NOT EXISTS pre_opening_minutes smallint not null default 0;

ALTER TABLE public.schedule_exceptions
  ADD COLUMN IF NOT EXISTS pre_opening_minutes smallint not null default 0;


-- =====================================
-- Migração 14/08/2026 — Ajustes em shop_settings (colunas de pausa/preview)
-- =====================================
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS is_lunch_paused boolean not null default false;

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS is_pre_opening boolean not null default false;


-- =====================================
-- Migração 15/08/2026 — Catálogo de serviços configurável (barber_services)
-- =====================================
create table IF NOT EXISTS public.barber_services (
  id text not null,
  label text not null,
  duration_minutes integer not null default 30,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  constraint barber_services_pkey primary key (id),
  constraint barber_services_duration_check check (duration_minutes > 0)
) TABLESPACE pg_default;

ALTER TABLE public.barber_services ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'barber_services' AND policyname = 'full_access_barber_services'
  ) THEN
    CREATE POLICY "full_access_barber_services" ON public.barber_services
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'barber_services'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE barber_services;
  END IF;
END $$;

INSERT INTO public.barber_services (id, label, duration_minutes, display_order, is_active) VALUES
  ('cabelo', 'Cabelo', 30, 0, true),
  ('barba', 'Barba', 30, 1, true),
  ('pezinho', 'Só o pezinho', 10, 2, true),
  ('sobrancelha', 'Sobrancelha', 5, 3, true)
ON CONFLICT (id) DO NOTHING;


-- =====================================
-- Migração 15/08/2026 — Backfill: tabela campaigns (já existia em prod, faltava registrar aqui)
-- =====================================
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

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns' AND policyname = 'full_access_campaigns'
  ) THEN
    CREATE POLICY "full_access_campaigns" ON public.campaigns
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;


-- =====================================
-- Migração 15/08/2026 — URL de webhook de campanhas configurável (shop_settings)
-- =====================================
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS campaign_webhook_url text null;
