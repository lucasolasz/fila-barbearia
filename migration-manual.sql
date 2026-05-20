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
