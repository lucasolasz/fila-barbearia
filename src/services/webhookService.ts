import { QueueItem } from "../lib/supabase";
import { calculateEstimatedServiceTime } from "../hooks/useQueue";

export type WebhookEvent = "JOINED" | "NEAR" | "NEXT";

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
  ): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl)
      return { success: false, message: "URL do webhook não configurada." };

    const payload: WebhookPayload = {
      type: "QUEUE_UPDATE",
      event: "JOINED",
      user: {
        name: "Cliente Teste",
        phone: "5511999999999",
      },
      queue: {
        position: 1,
        peopleAhead: 0,
        etaMinutes: 0,
        estimatedWait: "Agora",
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
    if (!webhookUrl) return false;

    try {
      let phone = item.customer?.phone?.replace(/\D/g, "") || "";
      if (phone && !phone.startsWith("55") && phone.length <= 11) {
        phone = "55" + phone;
      }

      const tempoEstimado = peopleAhead * baseTime; // Mantido para caso você ainda queira os minutos no n8n
      const estimatedWait = calculateEstimatedServiceTime(peopleAhead);

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
        const response = await fetch(finalWebhookUrl, {
          method: "POST",
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
}

export const webhookService = new WebhookService();
