import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Check,
  GripVertical,
  History,
  Loader2,
  LogOut,
  MessageCircle,
  Play,
  Power,
  Save,
  Scissors,
  Settings,
  Trash2,
  UserPlus,
  Users,
  X,
  Megaphone,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  useQueueCount,
  calculateEstimatedMinutes,
  calculateEstimatedServiceTime,
} from "../hooks/useQueue";
import { QueueItem, supabase } from "../lib/supabase";

import { useShopSettings } from "../hooks/useShopSettings";
import { webhookService } from "../services/webhookService";
import { DDD_OPTIONS } from "../constants/constants";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
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
  const [isToggling, setIsToggling] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<"auto" | "open" | "closed">(
    "auto",
  );
  const { shopName, logoUrl, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();

  const adminPin = import.meta.env.VITE_ADMIN_PIN || "1234";

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
      // Only update local queue if we are not currently dragging/reordering
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
      // Initialize settings if not exists
      const { data: newData } = await supabase
        .from("shop_settings")
        .insert([{ manual_status: "auto" }])
        .select()
        .single();
      if (newData) setManualStatus(newData.manual_status);
    }
  }, []);

  useEffect(() => {
    // Only connect to real-time if authenticated
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
            // Tocar o som apenas quando um NOVO cliente entrar na fila
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

    const interval = setInterval(
      () => {
        const servingItem = queue.find((item) => item.status === "serving");
        if (!servingItem?.service_start) return;

        const startTime = new Date(servingItem.service_start).getTime();
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

        if (startTime < thirtyMinutesAgo) {
          playServingTimeoutSound();
        }
      },
      10 * 60 * 1000,
    );

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
      //console.error(error);
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
                const etaMinutes =
                  await calculateEstimatedMinutes(itemPosition);
                const estimatedWait =
                  await calculateEstimatedServiceTime(itemPosition);

                const webhookSent = await webhookService.sendWebhook(
                  "DELAYED",
                  item,
                  itemPosition,
                  peopleAhead,
                  currentBaseTime,
                  shopName,
                  webhookUrl,
                  trackingUrlBase,
                );

                if (webhookSent) {
                  await supabase
                    .from("queue")
                    .update({ last_delay_sent_at: now.toISOString() })
                    .eq("id", item.id);
                  await new Promise((r) => setTimeout(r, 500));
                }
              }
            }
          }
        }

        for (let index = 0; index < waitingItems.length; index++) {
          const item = waitingItems[index];
          const position = servingCount + index + 1;
          const peopleAhead = position - 1;
          const lastPos = notifiedPositionMap.current.get(item.id);

          // 1. Registro inicial / Novos itens
          if (lastPos === undefined) {
            notifiedPositionMap.current.set(item.id, position);
            continue; // Não envia notificações no primeiro carregamento ou quando acaba de entrar
          }

          // 2. Detectar mudanças de posição
          if (lastPos !== position) {
            const notifiedNext = (item as any).notified_next ?? false;
            const notifiedNear = (item as any).notified_near ?? false;
            let webhookSent = false;

            // Caso: Chegou ao topo da fila (NEXT)
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
            }
            // Caso: Entrou no Top 3 (NEAR)
            else if (position <= 3 && lastPos > 3 && !notifiedNear) {
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
            }
            // Caso: Mudança genérica de posição (UPDATE) se o ETA mudar >= 10min
            else {
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

            // Atualiza o mapa local com a nova posição
            notifiedPositionMap.current.set(item.id, position);

            // Pequeno delay entre envios para não sobrecarregar
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === adminPin) {
      setIsAuthenticated(true);
      sessionStorage.setItem("barber_admin_auth", "true");
    } else {
      toast.error("PIN Inválido");
      setPin("");
    }
  };

  const handleStartService = async (item: QueueItem) => {
    if (processingId) return;
    setProcessingId(item.id);
    try {
      // 1. Mark current serving as completed if any
      const servingItem = queue.find((i) => i.status === "serving");
      if (servingItem) {
        const endTime = new Date();
        const startTime = new Date(servingItem.service_start!);
        const duration = Math.round(
          (endTime.getTime() - startTime.getTime()) / 60000,
        );

        await supabase
          .from("queue")
          .update({ status: "completed", service_end: endTime.toISOString() })
          .eq("id", servingItem.id);

        await supabase.from("services").insert([
          {
            customer_id: servingItem.customer_id,
            duration_minutes: duration,
          },
        ]);
      }

      // 2. Start new service
      await supabase
        .from("queue")
        .update({ status: "serving", service_start: new Date().toISOString() })
        .eq("id", item.id);

      toast.success(`Iniciou atendimento para ${item.customer?.name}`);
      // Normalize positions after changing statuses
      await normalizeQueuePositions();
      await fetchQueue();
    } catch (error) {
      //console.error(error);
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
        .update({ status: "completed", service_end: endTime.toISOString() })
        .eq("id", item.id);

      if (queueError) throw queueError;

      await supabase.from("services").insert([
        {
          customer_id: item.customer_id,
          duration_minutes: duration,
        },
      ]);

      toast.success(`Atendimento de ${item.customer?.name} finalizado!`);
      // Normalize positions after completing service
      await normalizeQueuePositions();
      await fetchQueue();
    } catch (error) {
      //console.error(error);
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
      // Normalize positions after removal
      await normalizeQueuePositions();
      await fetchQueue();
    } catch (error) {
      //console.error(error);
      toast.error("Falha ao remover cliente");
    } finally {
      setProcessingId(null);
    }
  };

  // Ensure queue positions are sequential and compact after status/position changes
  async function normalizeQueuePositions() {
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
  }

  const handleMove = async (item: QueueItem, direction: "up" | "down") => {
    if (processingId) return;
    // Only reorder among waiting items; find the corresponding waiting indices
    const waitingIndices = queue
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => q.status === "waiting")
      .map(({ idx }) => idx);

    const currentWaitingIndex = waitingIndices.findIndex(
      (i) => queue[i].id === item.id,
    );
    if (currentWaitingIndex === -1) return;

    const targetWaitingIndex =
      direction === "up" ? currentWaitingIndex - 1 : currentWaitingIndex + 1;
    if (targetWaitingIndex < 0 || targetWaitingIndex >= waitingIndices.length)
      return;

    const currentIdx = waitingIndices[currentWaitingIndex];
    const otherIdx = waitingIndices[targetWaitingIndex];

    const otherItem = queue[otherIdx];

    setProcessingId(item.id);
    try {
      // Swap only the numeric positions between the two waiting items
      await supabase
        .from("queue")
        .update({ position: otherItem.position })
        .eq("id", item.id);
      await supabase
        .from("queue")
        .update({ position: item.position })
        .eq("id", otherItem.id);
      toast.success("Posição atualizada");
      await fetchQueue();
    } catch (error) {
      toast.error("Falha ao mover posição");
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
      //console.error(error);
      toast.error("Falha ao salvar a nova ordem");
      setLoading(false);
    }
  };

  const handleCancelReorder = () => {
    setLocalQueue(queue);
    setIsReordering(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm space-y-8 rounded-3xl bg-neutral-900 p-8 shadow-2xl"
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-emerald-600 overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={shopName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Scissors className="h-10 w-10 text-white" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-white">{shopName} Admin</h1>
            <p className="text-neutral-400">
              Digite seu PIN de 4 dígitos para acessar
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <input
              type="password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="h-16 w-full rounded-2xl border-2 border-neutral-700 bg-neutral-800 text-center text-3xl font-bold text-white tracking-[1em] outline-none transition-all focus:bg-neutral-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30"
              autoFocus
            />
            <button
              type="submit"
              className="h-14 w-full rounded-2xl bg-emerald-600 font-bold text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-95"
            >
              Desbloquear Painel
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between p-4">
          <div className="flex items-center space-x-2">
            <div
              className={`overflow-hidden transition-all ${
                logoUrl
                  ? "h-8 w-8 rounded-lg"
                  : "rounded-lg bg-emerald-600 p-1.5"
              }`}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={shopName}
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Scissors className="h-5 w-5 text-white" />
              )}
            </div>
            <h1 className="text-xl font-bold text-white">Painel Admin</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleToggleManualStatus}
              className={`flex items-center sm:space-x-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                manualStatus === "auto"
                  ? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  : manualStatus === "open"
                    ? "bg-emerald-900/30 text-emerald-400"
                    : "bg-red-900/30 text-red-400"
              }`}
              title={
                manualStatus === "auto"
                  ? "Seguindo Horário"
                  : manualStatus === "open"
                    ? "Forçado Aberto"
                    : "Forçado Fechado"
              }
            >
              <Power
                className={`h-4 w-4 ${manualStatus !== "auto" ? "" : ""}`}
              />
              <span className="hidden sm:inline">
                {manualStatus === "auto"
                  ? "Automático"
                  : manualStatus === "open"
                    ? "Aberto"
                    : "Fechado"}
              </span>
            </button>
            <button
              onClick={() => navigate("/admin/history")}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 transition-colors"
              title="Histórico"
            >
              <History className="h-6 w-6" />
            </button>
            <button
              onClick={() => navigate("/admin/campaigns")}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 transition-colors"
              title="Campanhas"
            >
              <Megaphone className="h-6 w-6" />
            </button>
            <button
              onClick={() => navigate("/admin/settings")}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 transition-colors"
              title="Configurações"
            >
              <Settings className="h-6 w-6" />
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem("barber_admin_auth");
                setIsAuthenticated(false);
              }}
              className="rounded-xl p-2 text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 ">
          <div className="rounded-2xl bg-neutral-900 p-4 shadow-sm border border-neutral-800">
            <p className="text-xs font-bold uppercase text-neutral-500">
              Na Fila
            </p>
            <p className="text-2xl font-black text-white">{queue.length}</p>
          </div>

          <div className="rounded-2xl bg-emerald-600 p-4 text-white shadow-none">
            <p className="text-xs font-bold uppercase opacity-70">
              Atendendo Agora
            </p>
            <p className="text-xl font-bold truncate">
              {queue.find((i) => i.status === "serving")?.customer?.name ||
                "Ninguém no momento"}
            </p>
          </div>
        </div>

        {/* Queue List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Fila ao Vivo</h2>
            <div className="flex space-x-2">
              <AnimatePresence>
                {isReordering && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex space-x-2"
                  >
                    <button
                      onClick={handleCancelReorder}
                      className="flex items-center rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-400 hover:bg-neutral-700 transition-all"
                    >
                      <X className="mr-1 h-4 w-4" />
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveOrder}
                      className="flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-none hover:bg-emerald-700 transition-all"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      Salvar Ordem
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-none hover:bg-emerald-700 transition-all"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Adicionar Cliente
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="queue-list">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-3"
                  >
                    {localQueue.map((item, index) => {
                      const servingCount = localQueue.filter(
                        (i) => i.status === "serving",
                      ).length;
                      const waitingItems = localQueue.filter(
                        (i) => i.status === "waiting",
                      );
                      const waitingIndex = waitingItems.findIndex(
                        (i) => i.id === item.id,
                      );
                      const position =
                        item.status === "serving"
                          ? 1
                          : servingCount + waitingIndex + 1;
                      const estimatedTime =
                        calculateEstimatedServiceTime(position);
                      const DraggableComponent = Draggable as any;
                      return (
                        <DraggableComponent
                          key={item.id}
                          draggableId={item.id}
                          index={index}
                          isDragDisabled={item.status === "serving"}
                        >
                          {(provided: any, snapshot: any) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`group relative flex items-center justify-between rounded-2xl border p-4 transition-all ${
                                item.status === "serving"
                                  ? "bg-emerald-900/20 border-emerald-500/50 ring-2 ring-emerald-500/50"
                                  : snapshot.isDragging
                                    ? "bg-emerald-900/30 border-emerald-500 shadow-xl scale-[1.02] z-50"
                                    : "bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:shadow-md"
                              }`}
                              style={{
                                ...provided.draggableProps.style,
                              }}
                            >
                              <div className="flex items-center space-x-4">
                                {item.status === "waiting" && (
                                  <div
                                    {...provided.dragHandleProps}
                                    className="cursor-grab active:cursor-grabbing p-2 text-neutral-700 hover:text-neutral-500 transition-colors"
                                  >
                                    <GripVertical className="h-5 w-5" />
                                  </div>
                                )}
                                <div
                                  className={`flex h-12 w-auto p-2 shrink-0 items-center justify-center rounded-xl font-black ${
                                    item.status === "serving"
                                      ? "bg-emerald-600 text-white"
                                      : "bg-neutral-800 text-white"
                                  }`}
                                >
                                  {item.code}
                                </div>
                                <div>
                                  <h3 className="font-bold text-white">
                                    {item.customer?.name}
                                  </h3>
                                  {item.customer?.phone &&
                                    !item.customer.phone.startsWith(
                                      "manual_",
                                    ) && (
                                      <p className="text-xs text-neutral-500">
                                        {item.customer.phone}
                                      </p>
                                    )}
                                  <p className="text-xs text-neutral-600 mt-0.5">
                                    {new Date(item.created_at).toLocaleString(
                                      "pt-BR",
                                      {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                      },
                                    )}
                                  </p>
                                  {item.status === "serving" &&
                                    item.service_start && (
                                      <p className="text-xs text-emerald-400 mt-0.5 font-semibold">
                                        Iniciou:{" "}
                                        {new Date(
                                          item.service_start,
                                        ).toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          second: "2-digit",
                                        })}
                                      </p>
                                    )}
                                  <p className="text-xs text-neutral-500 mt-0.5">
                                    Previsto: {estimatedTime}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2">
                                {item.customer?.phone &&
                                  !item.customer.phone.startsWith(
                                    "manual_",
                                  ) && (
                                    <a
                                      href={`https://wa.me/${item.customer.phone.replace(/\D/g, "").startsWith("55") ? item.customer.phone.replace(/\D/g, "") : "55" + item.customer.phone.replace(/\D/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/20 text-emerald-500 hover:bg-emerald-900/40 transition-all"
                                      title="Contactar via WhatsApp"
                                    >
                                      <MessageCircle className="h-5 w-5" />
                                    </a>
                                  )}
                                {item.status === "serving" && (
                                  <button
                                    onClick={() => handleCompleteService(item)}
                                    disabled={!!processingId}
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50"
                                    title="Finalizar Atendimento"
                                  >
                                    <Check className="h-6 w-6" />
                                  </button>
                                )}
                                {item.status === "waiting" && (
                                  <>
                                    <button
                                      onClick={() => handleStartService(item)}
                                      disabled={!!processingId}
                                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50 "
                                      title="Iniciar Atendimento"
                                    >
                                      <Play className="h-5 w-5 fill-current" />
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => setItemToRemove(item.id)}
                                  disabled={!!processingId}
                                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-900/20 text-red-500 hover:bg-red-900/40 transition-all disabled:opacity-50"
                                  title="Remover"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </DraggableComponent>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {localQueue.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-neutral-600">
                <Users className="mb-4 h-12 w-12 opacity-20" />
                <p className="font-medium">A fila está vazia</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md rounded-3xl bg-neutral-900 p-8 shadow-2xl"
            >
              <h2 className="mb-6 text-2xl font-bold text-white">
                Adicionar Cliente
              </h2>
              <AddCustomerForm
                onClose={() => setShowAddModal(false)}
                onSuccess={() => {
                  setShowAddModal(false);
                  fetchQueue();
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remove Confirmation Modal */}
      <AnimatePresence>
        {itemToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm rounded-3xl bg-neutral-900 p-8 shadow-2xl text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-900/30 text-red-500">
                <Trash2 className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-white">
                Remover da Fila?
              </h2>
              <p className="mb-8 text-neutral-400">
                Esta ação não pode ser desfeita. O cliente será removido da
                lista de espera.
              </p>

              <div className="flex space-x-3">
                <button
                  onClick={() => setItemToRemove(null)}
                  className="h-12 flex-1 rounded-xl bg-neutral-800 font-bold text-neutral-400 hover:bg-neutral-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleRemove(itemToRemove)}
                  disabled={!!processingId}
                  className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white shadow-none hover:bg-red-700 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddCustomerForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [ddd, setDdd] = useState("21");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const queueCount = useQueueCount();
  const { shopName, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (phone && (phone.length !== 9 || !phone.startsWith("9"))) {
      toast.error(
        "Por favor, insira um número de celular válido (9 dígitos, iniciando com 9)",
      );
      return;
    }

    setLoading(true);
    try {
      // 1. Create/Get customer
      let customerId;
      const hasPhone = phone && phone.trim() !== "";
      const fullPhone = hasPhone ? `${ddd}${phone}` : "";
      const cleanPhone = hasPhone
        ? fullPhone.replace(/\D/g, "")
        : `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Só busca por um cliente existente se um telefone foi informado
      if (hasPhone && cleanPhone) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", cleanPhone)
          .maybeSingle();

        if (existing) {
          customerId = existing.id;
          await supabase
            .from("customers")
            .update({ name: name.trim() })
            .eq("id", customerId);
        }
      }

      if (!customerId) {
        const { data: created, error: createError } = await supabase
          .from("customers")
          .insert([{ name: name.trim(), phone: cleanPhone }])
          .select()
          .single();
        if (createError) throw createError;
        customerId = created.id;
      }

      // 2. Get next position
      const { data: last, error: lastError } = await supabase
        .from("queue")
        .select("position, code")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw lastError;

      const nextPos = (last?.position || 0) + 1;

      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const numbers = "0123456789";
      const allChars = letters + numbers;
      let nextCode = "";

      for (let i = 0; i < 4; i++) {
        nextCode += allChars.charAt(
          Math.floor(Math.random() * allChars.length),
        );
      }

      if (!/\d/.test(nextCode)) {
        nextCode += numbers.charAt(Math.floor(Math.random() * numbers.length));
      } else {
        nextCode += allChars.charAt(
          Math.floor(Math.random() * allChars.length),
        );
      }

      nextCode = nextCode
        .split("")
        .sort(() => Math.random() - 0.5)
        .join("");

      const { data: queueEntry, error: queueError } = await supabase
        .from("queue")
        .insert([
          {
            customer_id: customerId,
            code: nextCode,
            position: nextPos,
            status: "waiting",
          },
        ])
        .select("*, customer:customer_id(*)")
        .single();

      if (queueError) throw queueError;

      // Send webhooks
      const peopleAhead = queueCount;
      const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;
      if (!cleanPhone.startsWith("manual_")) {
        webhookService.sendWebhook(
          "JOINED",
          queueEntry,
          queueCount + 1,
          peopleAhead,
          currentBaseTime,
          shopName,
          webhookUrl,
          trackingUrlBase,
        );
      }

      toast.success("Adicionado à fila");
      onSuccess();
    } catch (error) {
      toast.error("Falha ao adicionar cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-400">
          Nome
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:bg-neutral-900 focus:border-emerald-500"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-400">
          Telefone (Opcional)
        </label>
        <div className="flex space-x-2">
          <div className="relative w-24 shrink-0">
            <select
              value={ddd}
              onChange={(e) => setDdd(e.target.value)}
              className="h-12 w-full appearance-none rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:bg-neutral-900 focus:border-emerald-500"
            >
              {DDD_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={phone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= 9) {
                setPhone(val);
              }
            }}
            placeholder="9XXXX-XXXX"
            className="h-12 flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:bg-neutral-900 focus:border-emerald-500"
          />
        </div>
      </div>
      <div className="flex space-x-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-xl bg-neutral-800 font-bold text-neutral-400 hover:bg-neutral-700"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-12 flex-1 rounded-xl bg-emerald-600 font-bold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : (
            "Adicionar à Fila"
          )}
        </button>
      </div>
    </form>
  );
}
