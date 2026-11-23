import type { Campaign, CampaignRecipient } from "./supabase";

/**
 * Progresso de uma campanha, calculado a partir de campaign_recipients.
 *
 * campaign_recipients é a fila de envio + lista de pendências:
 * - Durante o envio: 'pending' (falta enviar), 'sent', 'error', 'invalid_number'.
 * - No fim, o n8n APAGA as linhas 'sent'. Sobram só os contatos com problema,
 *   que o barbeiro resolve na tela (tentar novamente ou excluir da campanha).
 *
 * Por isso "enviados" não é contado pelas linhas 'sent' (que somem), e sim por
 * recipient_count - pendentes - com problema.
 *
 * Se a execução do n8n quebrar no meio, send_status fica 'sending' para sempre:
 * a tela deduz "interrompida" quando passa muito tempo sem nenhum envio.
 */

/**
 * Sem nenhum envio por este tempo, a campanha é considerada interrompida.
 * Precisa ser bem maior que a maior pausa do nó "Wait" do n8n (~2 min),
 * senão "Retomar" pode rodar junto com a execução original e enviar em dobro.
 */
export const CAMPAIGN_STALLED_AFTER_MINUTES = 10;

export type CampaignStats = {
  failed: number; // error + invalid_number: precisam do barbeiro
  pending: number; // ainda não processados pelo n8n
  /** Último envio com sucesso, ou null se ainda não enviou para ninguém. */
  lastSentAt: string | null;
};

export type CampaignDisplayStatus =
  | "sending" // n8n processando
  | "stalled" // tem pendentes, mas o n8n parou
  | "failed" // n8n não aceitou o disparo
  | "needs_attention" // envio terminou, sobraram contatos com problema
  | "completed"; // nada pendente

type RecipientRow = Pick<CampaignRecipient, "campaign_id" | "status" | "sent_at">;

/** Agrupa os destinatários por campanha. */
export function summarizeRecipients(rows: RecipientRow[]): Record<string, CampaignStats> {
  const statsByCampaign: Record<string, CampaignStats> = {};

  for (const row of rows) {
    const stats = (statsByCampaign[row.campaign_id] ??= { failed: 0, pending: 0, lastSentAt: null });

    if (row.status === "pending") stats.pending += 1;
    else if (row.status === "error" || row.status === "invalid_number") stats.failed += 1;

    if (row.sent_at && (!stats.lastSentAt || row.sent_at > stats.lastSentAt)) {
      stats.lastSentAt = row.sent_at;
    }
  }

  return statsByCampaign;
}

/** Quantos contatos já receberam a mensagem. */
export function sentCount(
  campaign: Pick<Campaign, "recipient_count">,
  stats: CampaignStats | undefined,
): number {
  return Math.max(0, campaign.recipient_count - (stats?.pending ?? 0) - (stats?.failed ?? 0));
}

/**
 * Status mostrado na tela.
 * - Com pendentes: 'failed' se o n8n recusou o disparo; senão 'sending', ou
 *   'stalled' se não há atividade há CAMPAIGN_STALLED_AFTER_MINUTES.
 *   Atividade = último envio ou último disparo (campaigns.updated_at, gravado
 *   pela tela ao enviar/retomar).
 * - Sem pendentes: 'needs_attention' se sobrou contato com problema, senão
 *   'completed' (mesmo que o n8n ainda não tenha gravado 'completed', pois a
 *   tela só escuta campaign_recipients em tempo real).
 */
export function campaignDisplayStatus(
  campaign: Pick<Campaign, "send_status" | "updated_at">,
  stats: CampaignStats | undefined,
  now: Date,
): CampaignDisplayStatus {
  if (!stats || stats.pending === 0) {
    return stats?.failed ? "needs_attention" : "completed";
  }
  if (campaign.send_status === "failed") return "failed";

  const lastActivity = Math.max(
    new Date(campaign.updated_at).getTime(),
    stats.lastSentAt ? new Date(stats.lastSentAt).getTime() : 0,
  );
  const minutesIdle = (now.getTime() - lastActivity) / 60_000;
  return minutesIdle >= CAMPAIGN_STALLED_AFTER_MINUTES ? "stalled" : "sending";
}

/** "Retomar envio": há pendentes e o n8n não está rodando. */
export function canResumeCampaign(status: CampaignDisplayStatus): boolean {
  return status === "stalled" || status === "failed";
}

/**
 * Ações nos contatos com problema. Bloqueadas durante o envio: "tentar
 * novamente" chama o n8n, e duas execuções juntas enviariam em dobro.
 */
export function canResolveIssues(status: CampaignDisplayStatus): boolean {
  return status !== "sending";
}
