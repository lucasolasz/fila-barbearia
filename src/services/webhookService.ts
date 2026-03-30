import { QueueItem } from '../lib/supabase';

export type WebhookEvent = 'JOINED' | 'NEAR' | 'NEXT';

export interface WebhookPayload {
  type: 'QUEUE_UPDATE';
  event: WebhookEvent;
  user: {
    name: string;
    phone: string;
  };
  queue: {
    position: number;
    peopleAhead: number;
    etaMinutes: number;
  };
  establishment: {
    name: string;
  };
  trackingUrl: string;
}

class WebhookService {
  private getSentEvents(): Record<string, WebhookEvent[]> {
    try {
      const stored = localStorage.getItem('webhook_sent_events');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private markEventAsSent(queueId: string, event: WebhookEvent) {
    const sentEvents = this.getSentEvents();
    if (!sentEvents[queueId]) {
      sentEvents[queueId] = [];
    }
    if (!sentEvents[queueId].includes(event)) {
      sentEvents[queueId].push(event);
      localStorage.setItem('webhook_sent_events', JSON.stringify(sentEvents));
    }
  }

  private unmarkEventAsSent(queueId: string, event: WebhookEvent) {
    const sentEvents = this.getSentEvents();
    if (sentEvents[queueId]) {
      sentEvents[queueId] = sentEvents[queueId].filter(e => e !== event);
      localStorage.setItem('webhook_sent_events', JSON.stringify(sentEvents));
    }
  }

  private hasEventBeenSent(queueId: string, event: WebhookEvent): boolean {
    const sentEvents = this.getSentEvents();
    return sentEvents[queueId]?.includes(event) || false;
  }

  public async testWebhook(webhookUrl: string, trackingUrlBase: string): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl) return { success: false, message: 'URL do webhook não configurada.' };

    const payload: WebhookPayload = {
      type: 'QUEUE_UPDATE',
      event: 'JOINED',
      user: {
        name: 'Cliente Teste',
        phone: '5511999999999',
      },
      queue: {
        position: 1,
        peopleAhead: 0,
        etaMinutes: 0,
      },
      establishment: {
        name: 'Barbearia Teste',
      },
      trackingUrl: trackingUrlBase || 'https://meuapp.com',
    };

    let finalWebhookUrl = webhookUrl.trim();
    if (!finalWebhookUrl.startsWith('http://') && !finalWebhookUrl.startsWith('https://')) {
      finalWebhookUrl = 'https://' + finalWebhookUrl;
    }

    try {
      const response = await fetch(finalWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { success: true, message: 'Webhook enviado com sucesso! Verifique seu n8n.' };
      } else {
        return { success: false, message: `Erro HTTP: ${response.status} ${response.statusText}` };
      }
    } catch (fetchError) {
      console.warn('Initial fetch failed for test (likely CORS). Trying no-cors fallback...', fetchError);
      
      try {
        await fetch(finalWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: JSON.stringify(payload),
        });
        return { success: true, message: 'Webhook enviado usando modo fallback (no-cors). Verifique seu n8n.' };
      } catch (fallbackError) {
        return { success: false, message: `Erro de rede ao enviar webhook: ${fallbackError instanceof Error ? fallbackError.message : 'Desconhecido'}` };
      }
    }
  }

  public async sendWebhook(
    event: WebhookEvent,
    item: any,
    position: number,
    peopleAhead: number,
    avgServiceTime: number,
    shopName: string,
    webhookUrl: string | null,
    trackingUrlBase: string | null
  ): Promise<boolean> {
    if (!webhookUrl) return false;

    // We still use localStorage to prevent accidental double-clicks on the same device
    if (this.hasEventBeenSent(item.id, event)) {
      return false;
    }
    this.markEventAsSent(item.id, event);

    try {
      let phone = item.customer?.phone?.replace(/\D/g, '') || '';
      if (phone && !phone.startsWith('55') && phone.length <= 11) {
        phone = '55' + phone;
      }

      const etaMinutes = peopleAhead * avgServiceTime;

      const payload: WebhookPayload = {
        type: 'QUEUE_UPDATE',
        event,
        user: {
          name: item.customer?.name || 'Cliente',
          phone,
        },
        queue: {
          position,
          peopleAhead,
          etaMinutes,
        },
        establishment: {
          name: shopName,
        },
        trackingUrl: trackingUrlBase || '',
      };

      let finalWebhookUrl = webhookUrl.trim();
      if (!finalWebhookUrl.startsWith('http://') && !finalWebhookUrl.startsWith('https://')) {
        finalWebhookUrl = 'https://' + finalWebhookUrl;
      }

      try {
        const response = await fetch(finalWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`Webhook sent successfully for ${item.id} - ${event}`);
          return true;
        } else {
          console.error(`Failed to send webhook for ${item.id} - ${event}: ${response.statusText}`);
          this.unmarkEventAsSent(item.id, event);
          return false;
        }
      } catch (fetchError) {
        console.warn(`Initial fetch failed (likely CORS). Trying no-cors fallback for ${item.id} - ${event}...`);
        
        try {
          await fetch(finalWebhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'text/plain',
            },
            body: JSON.stringify(payload),
          });
          console.log(`Webhook fallback sent for ${item.id} - ${event} (status unknown due to no-cors)`);
          return true;
        } catch (fallbackError) {
          console.error(`Fallback webhook also failed for ${item.id} - ${event}:`, fallbackError);
          this.unmarkEventAsSent(item.id, event);
          return false;
        }
      }
    } catch (error) {
      console.error(`Error processing webhook for ${item.id} - ${event}:`, error);
      this.unmarkEventAsSent(item.id, event);
      return false;
    }
  }
}

export const webhookService = new WebhookService();
