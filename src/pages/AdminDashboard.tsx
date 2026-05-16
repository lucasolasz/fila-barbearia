import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  calculateEstimatedMinutes,
  calculateEstimatedServiceTime,
  useQueueCount,
} from "../hooks/useQueue";
import { useShopSettings } from "../hooks/useShopSettings";
import { QueueItem, supabase } from "../lib/supabase";
import { webhookService } from "../services/webhookService";

import AdminHeader from "../components/admin/AdminHeader";
import AddCustomerModal from "../components/admin/AddCustomerModal";
import LoginScreen from "../components/admin/LoginScreen";
import QueueList from "../components/admin/QueueList";
import RemoveConfirmModal from "../components/admin/RemoveConfirmModal";
import StatsCards from "../components/admin/StatsCards";
import { DropResult } from "@hello-pangea/dnd";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [isReordering, setIsReorderingState] = useState(false);
  const isReorderingRef = useRef(false);
  const notifiedPositionMap = useRef<Map<string, number>>(new Map());
  const processingWebhooksRef = useRef(false);

  const setIsReordering = (value: boolean) => {
    isReorderingRef.current = value;
    setIsReorderingState(value);
  };
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<"auto" | "open" | "closed">(
    "auto",
  );
  const { shopName, logoUrl, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();

  const playUpdateSound = useCallback(() => {
    const audio = new Audio("/cash-register.mp3");
    audio
      .play()
      .catch((err) => console.warn("Áudio bloqueado pelo navegador:", err));
  }, []);

  const playWaitingAlertSound = useCallback(() => {
    const audio = new Audio("/atencao.mp3");
    audio
      .play()
      .catch((err) => console.warn("Áudio bloqueado pelo navegador:", err));
  }, []);

  const playServingTimeoutSound = useCallback(() => {
    const audio = new Audio("/atencao.mp3");
    audio
      .play()
      .catch((err) => console.warn("Áudio bloqueado pelo navegador:", err));
  }, []);

  const fetchQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from("queue")
      .select("*, customer:customer_id(*)")
      .in("status", ["waiting", "serving"])
      .order("position", { ascending: true });

    if (error) {
      console.error("Error fetching queue:", error);
      toast.error("Falha ao buscar a fila");
    } else {
      const sortedData = [...(data || [])].sort((a, b) => {
        if (a.status === "serving" && b.status !== "serving") return -1;
        if (a.status !== "serving" && b.status === "serving") return 1;
        return 0;
      });

      setQueue(sortedData);
      setLocalQueue((prev) => {
        if (isReorderingRef.current) return prev;
        return sortedData;
      });
    }
    setLoading(false);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from("shop_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      setManualStatus((prev) =>
        prev !== data.manual_status ? data.manual_status : prev,
      );
    } else if (!error) {
      const { data: newData } = await supabase
        .from("shop_settings")
        .insert([{ manual_status: "auto" }])
        .select()
        .single();
      if (newData) setManualStatus(newData.manual_status);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchQueue();
      fetchSettings();

      const channel = supabase
        .channel("admin_queue_updates")
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "queue" },
          (payload: any) => {
            fetchQueue();
            if (payload.eventType === "INSERT") {
              playUpdateSound();
            }
          },
        )
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "shop_settings" },
          () => {
            fetchSettings();
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isAuthenticated, fetchQueue, fetchSettings, playUpdateSound]);

  useEffect(() => {
    if (!isAuthenticated || queue.length === 0) return;

    const hasServing = queue.some((item) => item.status === "serving");
    if (hasServing) return;

    const interval = setInterval(
      () => {
        playWaitingAlertSound();
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [isAuthenticated, queue, playWaitingAlertSound]);

  useEffect(() => {
    if (!isAuthenticated || queue.length === 0) return;

    const hasServing = queue.some((item) => item.status === "serving");
    if (!hasServing) return;

    const interval = setInterval(() => {
      const servingItem = queue.find((item) => item.status === "serving");
      if (!servingItem?.service_start) return;

      const startTime = new Date(servingItem.service_start).getTime();
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

      if (startTime < thirtyMinutesAgo) {
        playServingTimeoutSound();
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, queue, playServingTimeoutSound]);

  useEffect(() => {
    const auth = sessionStorage.getItem("barber_admin_auth");
    if (auth === "true") {
      setIsAuthenticated(true);
    } else {
      setLoading(false);
    }
  }, []);

  const handleToggleManualStatus = async () => {
    const nextStatus: Record<
      "auto" | "open" | "closed",
      "auto" | "open" | "closed"
    > = {
      auto: "open",
      open: "closed",
      closed: "auto",
    };

    const newStatus = nextStatus[manualStatus];

    try {
      const { data: current } = await supabase
        .from("shop_settings")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (current) {
        await supabase
          .from("shop_settings")
          .update({ manual_status: newStatus })
          .eq("id", current.id);
      } else {
        await supabase
          .from("shop_settings")
          .insert([{ manual_status: newStatus }]);
      }
      setManualStatus(newStatus);
      const id = toast.success(
        `Fila em modo ${newStatus === "auto" ? "Automático" : newStatus === "open" ? "Aberto" : "Fechado"}`,
      );
      setTimeout(() => {
        toast.dismiss(id);
      }, 1800);
    } catch (error) {
      toast.error("Falha ao atualizar status da fila");
    }
  };

  useEffect(() => {
    if (!isAuthenticated || queue.length === 0 || processingWebhooksRef.current)
      return;

    const processWebhooks = async () => {
      processingWebhooksRef.current = true;
      try {
        const servingCount = queue.filter(
          (item) => item.status === "serving",
        ).length;
        const waitingItems = queue
          .filter((item) => item.status === "waiting")
          .sort((a, b) => a.position - b.position);

        const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;

        const servingItem = queue.find((i) => i.status === "serving");
        if (servingItem && servingItem.service_start) {
          const now = new Date();
          const started = new Date(servingItem.service_start);
          const elapsed = Math.round(
            (now.getTime() - started.getTime()) / 60000,
          );
          const avg = 37;
          const delayMinutes = elapsed - avg;

          if (delayMinutes > 0 && delayMinutes % 10 === 0) {
            for (let i = 0; i < waitingItems.length; i++) {
              const item = waitingItems[i];
              const itemPosition = servingCount + i + 1;
              const peopleAhead = itemPosition - 1;

              const lastDelaySent = (item as any).last_delay_sent_at
                ? new Date((item as any).last_delay_sent_at)
                : null;
              const cooldownMs = 5 * 60 * 1000;

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
          }
        }

        for (let index = 0; index < waitingItems.length; index++) {
          const item = waitingItems[index];
          const position = servingCount + index + 1;
          const peopleAhead = position - 1;
          const lastPos = notifiedPositionMap.current.get(item.id);

          if (lastPos === undefined) {
            notifiedPositionMap.current.set(item.id, position);
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

            if (webhookSent) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
      } finally {
        processingWebhooksRef.current = false;
      }
    };

    processWebhooks();
  }, [
    queue,
    isAuthenticated,
    baseQueueTime,
    shopName,
    webhookUrl,
    trackingUrlBase,
  ]);

  const normalizeQueuePositions = async () => {
    try {
      const { data: servingItems } = await supabase
        .from("queue")
        .select("id, position, status")
        .eq("status", "serving")
        .order("position", { ascending: true });

      const { data: waitingItems } = await supabase
        .from("queue")
        .select("id, position, status")
        .eq("status", "waiting")
        .order("position", { ascending: true });

      const combined = [...(servingItems || []), ...(waitingItems || [])];

      const updates: Promise<any>[] = [];
      for (let i = 0; i < combined.length; i++) {
        const desiredPos = i + 1;
        const item = combined[i] as any;
        if (item.position !== desiredPos) {
          updates.push(
            supabase
              .from("queue")
              .update({ position: desiredPos })
              .eq("id", item.id),
          );
        }
      }

      if (updates.length > 0) await Promise.all(updates);
    } catch (err) {
      console.error("Failed to normalize queue positions:", err);
    }
  };

  const handleStartService = async (item: QueueItem) => {
    if (processingId) return;
    setProcessingId(item.id);
    try {
      const servingItem = queue.find((i) => i.status === "serving");
      if (servingItem) {
        const endTime = new Date();
        const startTime = new Date(servingItem.service_start!);
        const duration = Math.round(
          (endTime.getTime() - startTime.getTime()) / 60000,
        );

        await supabase
          .from("queue")
          .update({
            status: "completed",
            service_end: endTime.toISOString(),
          })
          .eq("id", servingItem.id);

        await supabase.from("services").insert([
          {
            customer_id: servingItem.customer_id,
            duration_minutes: duration,
          },
        ]);
      }

      await supabase
        .from("queue")
        .update({
          status: "serving",
          service_start: new Date().toISOString(),
        })
        .eq("id", item.id);

      toast.success(`Iniciou atendimento para ${item.customer?.name}`);
      await normalizeQueuePositions();
      await fetchQueue();
    } catch (error) {
      toast.error("Falha ao iniciar atendimento");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCompleteService = async (item: QueueItem) => {
    if (processingId) return;
    setProcessingId(item.id);
    try {
      const endTime = new Date();
      const startTime = new Date(item.service_start!);
      const duration = Math.round(
        (endTime.getTime() - startTime.getTime()) / 60000,
      );

      const { error: queueError } = await supabase
        .from("queue")
        .update({
          status: "completed",
          service_end: endTime.toISOString(),
        })
        .eq("id", item.id);

      if (queueError) throw queueError;

      await supabase.from("services").insert([
        {
          customer_id: item.customer_id,
          duration_minutes: duration,
        },
      ]);

      toast.success(`Atendimento de ${item.customer?.name} finalizado!`);
      await normalizeQueuePositions();
      await fetchQueue();
    } catch (error) {
      toast.error("Falha ao finalizar atendimento");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from("queue")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
      toast.success("Cliente removido");
      setItemToRemove(null);
      await normalizeQueuePositions();
      await fetchQueue();
    } catch (error) {
      toast.error("Falha ao remover cliente");
    } finally {
      setProcessingId(null);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    const newQueue = Array.from(localQueue);
    const [reorderedItem] = newQueue.splice(sourceIndex, 1);
    newQueue.splice(destinationIndex, 0, reorderedItem);

    setLocalQueue(newQueue);
    setIsReordering(true);
  };

  const handleSaveOrder = async () => {
    setLoading(true);
    try {
      const servingCount = localQueue.filter(
        (i) => i.status === "serving",
      ).length;
      let posCounter = servingCount;
      const updates: Promise<any>[] = [];
      for (const item of localQueue) {
        if (item.status === "waiting") {
          posCounter += 1;
          if (item.position !== posCounter) {
            updates.push(
              supabase
                .from("queue")
                .update({ position: posCounter })
                .eq("id", item.id),
            );
          }
        }
      }

      if (updates.length > 0) await Promise.all(updates);

      toast.success("Ordem da fila atualizada!");
      setIsReordering(false);
      fetchQueue();
    } catch (error) {
      toast.error("Falha ao salvar a nova ordem");
      setLoading(false);
    }
  };

  const handleCancelReorder = () => {
    setLocalQueue(queue);
    setIsReordering(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("barber_admin_auth");
    setIsAuthenticated(false);
  };

if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-800 border-t-emerald-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        shopName={shopName}
        logoUrl={logoUrl ?? undefined}
        onLogin={() => setIsAuthenticated(true)}
      />
    );
  }

  const itemToRemoveName = itemToRemove
    ? queue.find((i) => i.id === itemToRemove)?.customer?.name || ""
    : "";

  return (
    <div className="min-h-screen bg-neutral-950 pb-20">
      <AdminHeader
        shopName={shopName}
        logoUrl={logoUrl ?? undefined}
        manualStatus={manualStatus}
        onToggleManualStatus={handleToggleManualStatus}
        onNavigate={navigate}
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        <StatsCards queue={queue} />

        <QueueList
          queue={queue}
          localQueue={localQueue}
          isReordering={isReordering}
          processingId={processingId}
          onDragEnd={onDragEnd}
          onSaveOrder={handleSaveOrder}
          onCancelReorder={handleCancelReorder}
          onStartService={handleStartService}
          onCompleteService={handleCompleteService}
          onRemove={(id) => setItemToRemove(id)}
          onAddCustomer={() => setShowAddModal(true)}
          loading={loading}
        />
      </main>

      <AddCustomerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          fetchQueue();
        }}
      />

      <RemoveConfirmModal
        isOpen={!!itemToRemove}
        itemName={itemToRemoveName}
        onConfirm={() => itemToRemove && handleRemove(itemToRemove)}
        onCancel={() => setItemToRemove(null)}
        isProcessing={!!processingId}
      />
    </div>
  );
}