import { useEffect, useRef } from "react";
import { QueueItem, supabase } from "../lib/supabase";
import { webhookService } from "../services/webhookService";
import { calculateEstimatedMinutes } from "./useQueue";

interface Params {
  isAuthenticated: boolean;
  queue: QueueItem[];
  baseQueueTime: number | null;
  shopName: string;
  webhookUrl: string | null;
  trackingUrlBase: string | null;
}

export function useWebhookNotifications({
  isAuthenticated,
  queue,
  baseQueueTime,
  shopName,
  webhookUrl,
  trackingUrlBase,
}: Params) {
  const notifiedPositionMap = useRef<Map<string, number>>(new Map());
  const processingWebhooksRef = useRef(false);
  const processingDelayRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || queue.length === 0 || processingWebhooksRef.current)
      return;

    const processWebhooks = async () => {
      processingWebhooksRef.current = true;
      try {
        const servingCount = queue.filter((i) => i.status === "serving").length;
        const waitingItems = queue
          .filter((i) => i.status === "waiting")
          .sort((a, b) => a.position - b.position);
        const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;

        for (let index = 0; index < waitingItems.length; index++) {
          const item = waitingItems[index];
          const position = servingCount + index + 1;
          const peopleAhead = position - 1;
          const lastPos = notifiedPositionMap.current.get(item.id);

          if (lastPos === undefined) {
            notifiedPositionMap.current.set(item.id, position);
            const etaMinutes = await calculateEstimatedMinutes(position);
            await supabase
              .from("queue")
              .update({ last_sent_eta: etaMinutes })
              .eq("id", item.id);
            continue;
          }

          if (lastPos !== position) {
            const notifiedNext = (item as any).notified_next ?? false;
            const notifiedNear = (item as any).notified_near ?? false;
            let webhookSent = false;

            const nextTriggerPosition = servingCount + 1;
            if (
              position === nextTriggerPosition &&
              lastPos > nextTriggerPosition &&
              !notifiedNext
            ) {
              webhookSent = await webhookService.sendWebhook(
                "NEXT",
                item,
                position,
                peopleAhead,
                currentBaseTime,
                shopName,
                webhookUrl,
                trackingUrlBase,
              );
              if (webhookSent) {
                await supabase
                  .from("queue")
                  .update({ notified_next: true })
                  .eq("id", item.id);
              }
            } else if (position <= 3 && lastPos > 3 && !notifiedNear) {
              webhookSent = await webhookService.sendWebhook(
                "NEAR",
                item,
                position,
                peopleAhead,
                currentBaseTime,
                shopName,
                webhookUrl,
                trackingUrlBase,
              );
              if (webhookSent) {
                await supabase
                  .from("queue")
                  .update({ notified_near: true })
                  .eq("id", item.id);
              }
            } else {
              try {
                const etaMinutes = await calculateEstimatedMinutes(position);
                const prevSentEta = (item as any).last_sent_eta;
                const prevSentAt = (item as any).last_update_sent_at
                  ? new Date((item as any).last_update_sent_at)
                  : null;
                const now = new Date();
                const cooldownMs = 5 * 60 * 1000;
                const etaDiff =
                  prevSentEta == null
                    ? Infinity
                    : Math.abs(etaMinutes - prevSentEta);

                if (
                  etaDiff >= 10 &&
                  (prevSentAt == null ||
                    now.getTime() - prevSentAt.getTime() >= cooldownMs)
                ) {
                  webhookSent = await webhookService.sendWebhook(
                    "UPDATE",
                    item,
                    position,
                    peopleAhead,
                    currentBaseTime,
                    shopName,
                    webhookUrl,
                    trackingUrlBase,
                  );
                  if (webhookSent) {
                    await supabase
                      .from("queue")
                      .update({
                        last_update_sent_at: now.toISOString(),
                        last_sent_eta: etaMinutes,
                      })
                      .eq("id", item.id);
                  }
                }
              } catch (e) {
                console.error("Erro ao processar UPDATE:", e);
              }
            }

            notifiedPositionMap.current.set(item.id, position);
            if (webhookSent) await new Promise((r) => setTimeout(r, 500));
          } else {
            // Position unchanged — check time-based ETA drift
            try {
              const etaMinutes = await calculateEstimatedMinutes(position);
              const prevSentEta = (item as any).last_sent_eta;
              const prevSentAt = (item as any).last_update_sent_at
                ? new Date((item as any).last_update_sent_at)
                : null;
              const now = new Date();
              const cooldownMs = 5 * 60 * 1000;
              const etaDiff =
                prevSentEta == null
                  ? Infinity
                  : Math.abs(etaMinutes - prevSentEta);
              if (
                etaDiff >= 10 &&
                (prevSentAt == null ||
                  now.getTime() - prevSentAt.getTime() >= cooldownMs)
              ) {
                const sent = await webhookService.sendWebhook(
                  "UPDATE",
                  item,
                  position,
                  peopleAhead,
                  currentBaseTime,
                  shopName,
                  webhookUrl,
                  trackingUrlBase,
                );
                if (sent) {
                  await supabase
                    .from("queue")
                    .update({
                      last_update_sent_at: now.toISOString(),
                      last_sent_eta: etaMinutes,
                    })
                    .eq("id", item.id);
                  await new Promise((r) => setTimeout(r, 500));
                }
              }
            } catch (e) {
              console.error("Erro ao processar ETA drift:", e);
            }
          }
        }
      } finally {
        processingWebhooksRef.current = false;
      }
    };

    processWebhooks();
  }, [queue, isAuthenticated, baseQueueTime, shopName, webhookUrl, trackingUrlBase]);

  useEffect(() => {
    if (!isAuthenticated || !webhookUrl) return;

    const checkDelays = async () => {
      if (processingDelayRef.current) return;
      processingDelayRef.current = true;
      try {
        const servingItem = queue.find((i) => i.status === "serving");
        if (!servingItem?.service_start) return;

        const now = new Date();
        const started = new Date(servingItem.service_start);
        const elapsed = Math.round(
          (now.getTime() - started.getTime()) / 60000,
        );
        const plannedDuration = servingItem.service_duration ?? 30;
        if (elapsed <= plannedDuration) return;

        const waitingItems = queue
          .filter((i) => i.status === "waiting")
          .sort((a, b) => a.position - b.position);
        const cooldownMs = 10 * 60 * 1000;
        const currentBaseTime = baseQueueTime ?? 30;

        for (let i = 0; i < waitingItems.length; i++) {
          const item = waitingItems[i];
          const itemPosition = i + 2;
          const peopleAhead = itemPosition - 1;
          const lastDelaySent = item.last_delay_sent_at
            ? new Date(item.last_delay_sent_at)
            : null;

          if (
            lastDelaySent === null ||
            now.getTime() - lastDelaySent.getTime() >= cooldownMs
          ) {
            await webhookService.sendWebhook(
              "DELAYED",
              item,
              itemPosition,
              peopleAhead,
              currentBaseTime,
              shopName,
              webhookUrl,
              trackingUrlBase,
            );
            await supabase
              .from("queue")
              .update({ last_delay_sent_at: now.toISOString() })
              .eq("id", item.id);
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      } finally {
        processingDelayRef.current = false;
      }
    };

    checkDelays();
    const interval = setInterval(checkDelays, 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, queue, baseQueueTime, shopName, webhookUrl, trackingUrlBase]);
}
