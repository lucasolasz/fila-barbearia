import { markNotified } from "../lib/queueNotificationFlags";
import { calculateEstimatedMinutes, calculateEstimatedServiceTimeDynamic } from "../hooks/useQueue";

export type WebhookEvent = "JOINED" | "JOINED_IN_LUNCH" | "JOINED_IN_PRE_OPENING" | "NEAR" | "NEXT" | "UPDATE" | "DELAYED" | "LUNCH_START" | "LUNCH_END";

/** Evento de entrada na fila conforme o estado da barbearia no momento. */
export function joinedEventFor(
  isLunchPaused: boolean,
  isPreOpening: boolean,
): WebhookEvent {
  if (isLunchPaused) return "JOINED_IN_LUNCH";
  if (isPreOpening) return "JOINED_IN_PRE_OPENING";
  return "JOINED";
}

/**
 * O n8n busca título, mensagem e destinatários no banco pelo id
 * (tabelas campaigns e campaign_recipients).
 */
export interface CampaignWebhookPayload {
  campaign_id: string;
}

/** Id que não existe no banco: o teste chega ao n8n, mas nenhuma mensagem é enviada. */
const CAMPAIGN_TEST_ID = "00000000-0000-0000-0000-000000000000";

export interface WebhookPayload {
  type: "QUEUE_UPDATE";
  event: WebhookEvent;
  user: {
    name: string;
    phone: string;
  };
  queue: {
    position: number;
    peopleAhead: number;
    etaMinutes: number;
    estimatedWait: string;
  };
  establishment: {
    name: string;
  };
  trackingUrl: string;
}

class WebhookService {
  public async testWebhook(
    webhookUrl: string,
    trackingUrlBase: string,
    event: WebhookEvent = "JOINED",
  ): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl)
      return { success: false, message: "URL do webhook não configurada." };

    const payload: WebhookPayload = {
      type: "QUEUE_UPDATE",
      event,
      user: {
        name: "Cliente Teste",
        phone: "5511999999999",
      },
      queue: {
        position: 2,
        peopleAhead: 1,
        etaMinutes: 67,
        estimatedWait: "10:30 e 10:45",
      },
      establishment: {
        name: "Barbearia Teste",
      },
      trackingUrl: trackingUrlBase || "https://meuapp.com",
    };

    let finalWebhookUrl = webhookUrl.trim();
    if (
      !finalWebhookUrl.startsWith("http://") &&
      !finalWebhookUrl.startsWith("https://")
    ) {
      finalWebhookUrl = "https://" + finalWebhookUrl;
    }

    try {
      const response = await fetch(finalWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return {
          success: true,
          message: "Webhook enviado com sucesso! Verifique seu n8n.",
        };
      } else {
        return {
          success: false,
          message: `Erro HTTP: ${response.status} ${response.statusText}`,
        };
      }
    } catch (fetchError) {
      console.warn(
        "Initial fetch failed for test (likely CORS). Trying no-cors fallback...",
        fetchError,
      );

      try {
        await fetch(finalWebhookUrl, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "text/plain",
          },
          body: JSON.stringify(payload),
        });
        return {
          success: true,
          message:
            "Webhook enviado usando modo fallback (no-cors). Verifique seu n8n.",
        };
      } catch (fallbackError) {
        return {
          success: false,
          message: `Erro de rede ao enviar webhook: ${fallbackError instanceof Error ? fallbackError.message : "Desconhecido"}`,
        };
      }
    }
  }

  public async testCampaignWebhook(
    webhookUrl: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl)
      return { success: false, message: "URL do webhook não configurada." };

    const payload: CampaignWebhookPayload = { campaign_id: CAMPAIGN_TEST_ID };

    let finalWebhookUrl = webhookUrl.trim();
    if (
      !finalWebhookUrl.startsWith("http://") &&
      !finalWebhookUrl.startsWith("https://")
    ) {
      finalWebhookUrl = "https://" + finalWebhookUrl;
    }

    try {
      const response = await fetch(finalWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return {
          success: true,
          message: "URL respondeu! Teste usa campanha inexistente: nenhuma mensagem é enviada.",
        };
      } else {
        return {
          success: false,
          message: `Erro HTTP: ${response.status} ${response.statusText}`,
        };
      }
    } catch (fetchError) {
      console.warn(
        "Initial fetch failed for campaign test (likely CORS). Trying no-cors fallback...",
        fetchError,
      );

      try {
        await fetch(finalWebhookUrl, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "text/plain",
          },
          body: JSON.stringify(payload),
        });
        return {
          success: true,
          message:
            "Webhook enviado usando modo fallback (no-cors). Verifique seu n8n.",
        };
      } catch (fallbackError) {
        return {
          success: false,
          message: `Erro de rede ao enviar webhook: ${fallbackError instanceof Error ? fallbackError.message : "Desconhecido"}`,
        };
      }
    }
  }

  public async sendWebhook(
    event: WebhookEvent,
    item: any,
    position: number,
    peopleAhead: number,
    baseTime: number,
    shopName: string,
    webhookUrl: string | null,
    trackingUrlBase: string | null,
  ): Promise<boolean> {
    if (!webhookUrl) {
      console.error(
        `Webhook não enviado para ${item.id} - ${event}: webhook_url não configurado.`,
      );
      return false;
    }

    try {
      let phone = item.customer?.phone?.replace(/\D/g, "") || "";
      if (phone && !phone.startsWith("55") && phone.length <= 11) {
        phone = "55" + phone;
      }

      const tempoEstimado = await calculateEstimatedMinutes(peopleAhead + 1);
      const estimatedWait = await calculateEstimatedServiceTimeDynamic(
        peopleAhead + 1,
      );

      const payload: WebhookPayload = {
        type: "QUEUE_UPDATE",
        event,
        user: {
          name: item.customer?.name || "Cliente",
          phone,
        },
        queue: {
          position,
          peopleAhead,
          etaMinutes: tempoEstimado,
          estimatedWait,
        },
        establishment: {
          name: shopName,
        },
        trackingUrl: trackingUrlBase || "",
      };

      let finalWebhookUrl = webhookUrl.trim();
      if (
        !finalWebhookUrl.startsWith("http://") &&
        !finalWebhookUrl.startsWith("https://")
      ) {
        finalWebhookUrl = "https://" + finalWebhookUrl;
      }

      try {
        // keepalive: o envio termina mesmo se o cliente fechar a aba logo depois.
        const response = await fetch(finalWebhookUrl, {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`Webhook sent successfully for ${item.id} - ${event}`);
          return true;
        } else {
          console.error(
            `Failed to send webhook for ${item.id} - ${event}: ${response.statusText}`,
          );
          return false;
        }
      } catch (fetchError) {
        console.warn(
          `Initial fetch failed (likely CORS). Trying no-cors fallback for ${item.id} - ${event}...`,
        );

        try {
          await fetch(finalWebhookUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
              "Content-Type": "text/plain",
            },
            body: JSON.stringify(payload),
          });
          console.log(
            `Webhook fallback sent for ${item.id} - ${event} (status unknown due to no-cors)`,
          );
          return true;
        } catch (fallbackError) {
          console.error(
            `Fallback webhook also failed for ${item.id} - ${event}:`,
            fallbackError,
          );
          return false;
        }
      }
    } catch (error) {
      console.error(
        `Error processing webhook for ${item.id} - ${event}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Mensagem de entrada na fila. Marca `joined_notified_at` quando o envio da
   * certo; se nao for marcada, o painel do barbeiro reenvia (ver
   * needsJoinedFallback).
   */
  public async sendJoinedWebhook(
    event: WebhookEvent,
    item: any,
    position: number,
    peopleAhead: number,
    baseTime: number,
    shopName: string,
    webhookUrl: string | null,
    trackingUrlBase: string | null,
  ): Promise<boolean> {
    const sent = await this.sendWebhook(
      event,
      item,
      position,
      peopleAhead,
      baseTime,
      shopName,
      webhookUrl,
      trackingUrlBase,
    );
    if (sent) await markNotified(item.id, "joined_notified_at");
    else console.error(`Webhook ${event} falhou para ${item.id}`);
    return sent;
  }
}

export const webhookService = new WebhookService();
