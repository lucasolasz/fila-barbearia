import type { Campaign, CampaignRecipient } from "./supabase";

/**
 * Progresso de uma campanha, calculado a partir de campaign_recipients.
 *
 * O n8n grava o resultado de cada destinatário (sent / error / invalid_number)
 * e, no fim, marca campaigns.send_status = 'completed'. Se a execução do n8n
 * quebrar no meio, send_status fica 'sending' para sempre: por isso a tela
 * deduz "interrompida" quando passa muito tempo sem nenhum envio.
 */

/**
 * Sem nenhum envio por este tempo, a campanha é considerada interrompida.
 * Precisa ser bem maior que a maior pausa do nó "Wait" do n8n (~2 min),
 * senão "Retomar" pode rodar junto com a execução original e enviar em dobro.
 */
export const CAMPAIGN_STALLED_AFTER_MINUTES = 10;

export type CampaignStats = {
  total: number;
  sent: number;
  failed: number; // error + invalid_number
  pending: number;
  /** Último envio com sucesso, ou null se ainda não enviou para ninguém. */
  lastSentAt: string | null;
};

export type CampaignDisplayStatus = "sending" | "stalled" | "failed" | "completed";

type RecipientRow = Pick<CampaignRecipient, "campaign_id" | "status" | "sent_at">;

const EMPTY_STATS: CampaignStats = { total: 0, sent: 0, failed: 0, pending: 0, lastSentAt: null };

/** Agrupa os destinatários por campanha. */
export function summarizeRecipients(rows: RecipientRow[]): Record<string, CampaignStats> {
  const statsByCampaign: Record<string, CampaignStats> = {};

  for (const row of rows) {
    const stats = (statsByCampaign[row.campaign_id] ??= { ...EMPTY_STATS });
    stats.total += 1;

    if (row.status === "sent") stats.sent += 1;
    else if (row.status === "pending") stats.pending += 1;
    else stats.failed += 1;

    if (row.sent_at && (!stats.lastSentAt || row.sent_at > stats.lastSentAt)) {
      stats.lastSentAt = row.sent_at;
    }
  }

  return statsByCampaign;
}

/**
 * Status mostrado na tela.
 * - Sem pendentes = concluída, mesmo que o n8n ainda não tenha gravado 'completed'
 *   (a tela só escuta campaign_recipients em tempo real, não campaigns).
 * - 'sending' sem atividade há CAMPAIGN_STALLED_AFTER_MINUTES = interrompida.
 *   Atividade = último envio ou último disparo (campaigns.updated_at, gravado
 *   pela tela ao enviar/retomar).
 */
export function campaignDisplayStatus(
  campaign: Pick<Campaign, "send_status" | "updated_at">,
  stats: CampaignStats | undefined,
  now: Date,
): CampaignDisplayStatus {
  if (!stats || stats.pending === 0) return "completed";
  if (campaign.send_status === "failed") return "failed";
  if (campaign.send_status === "completed") return "completed";

  const lastActivity = Math.max(
    new Date(campaign.updated_at).getTime(),
    stats.lastSentAt ? new Date(stats.lastSentAt).getTime() : 0,
  );
  const minutesIdle = (now.getTime() - lastActivity) / 60_000;
  return minutesIdle >= CAMPAIGN_STALLED_AFTER_MINUTES ? "stalled" : "sending";
}

/** "Retomar envio" só faz sentido quando ainda há pendentes e nada está rodando. */
export function canResumeCampaign(status: CampaignDisplayStatus): boolean {
  return status === "stalled" || status === "failed";
}
