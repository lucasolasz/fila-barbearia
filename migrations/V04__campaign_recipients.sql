-- =====================================
-- V04 — Campanhas v2: fila de destinatários + status de envio
-- =====================================
-- Fluxo:
--   1. O admin (tela Campanhas) grava a campanha com send_status = 'sending'.
--   2. Grava um destinatário por contato em campaign_recipients, status 'pending'.
--   3. Chama o webhook do n8n só com { campaign_id }.
--   4. O n8n ("Barbearia - Campanha") lê os 'pending', envia um por um e marca
--      cada linha como 'sent', 'error' ou 'invalid_number'. No fim marca a
--      campanha como 'completed'.
--
-- Idempotente: a base de desenvolvimento já tem estas estruturas (vieram do
-- branch feat-campanhas). Pode rodar em qualquer ambiente sem erro.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS send_status text null;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_send_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_send_status_check
  CHECK ((send_status is null) or (send_status = any (array['sending'::text, 'completed'::text, 'failed'::text])));

-- Campanhas enviadas antes da V04 não têm rastreio por destinatário: ficam como concluídas.
UPDATE public.campaigns
SET send_status = 'completed'
WHERE is_draft = false AND send_status IS NULL;

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers (id) ON DELETE SET NULL,
  nome text NOT NULL,
  numero text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  error_message text NULL,
  sent_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_recipients_status_check CHECK (
    (status = any (array['pending'::text, 'sent'::text, 'error'::text, 'invalid_number'::text]))
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status
  ON public.campaign_recipients (campaign_id, status);

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "full_access_campaign_recipients" ON public.campaign_recipients;
CREATE POLICY "full_access_campaign_recipients" ON public.campaign_recipients
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime: a tela Campanhas acompanha o progresso do envio.
-- Bloco anônimo (não cria function): só adiciona se ainda não estiver na publicação.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaign_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
  END IF;
END $$;
