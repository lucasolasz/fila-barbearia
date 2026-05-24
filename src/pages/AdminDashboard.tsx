import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  calculateEstimatedServiceTimeFromEntries,
  useShopStatus,
} from "../hooks/useQueue";
import { useShopSettings } from "../hooks/useShopSettings";
import { useQueueActions } from "../hooks/useQueueActions";
import { useWebhookNotifications } from "../hooks/useWebhookNotifications";
import { QueueItem, supabase } from "../lib/supabase";
import { webhookService } from "../services/webhookService";

import AdminHeader from "../components/admin/AdminHeader";
import AddCustomerModal from "../components/admin/AddCustomerModal";
import LoginScreen from "../components/admin/LoginScreen";
import QueueList from "../components/admin/QueueList";
import RemoveConfirmModal from "../components/admin/RemoveConfirmModal";
import StatsCards from "../components/admin/StatsCards";
import { DropResult } from "@hello-pangea/dnd";

async function updateShopSettings(patch: Record<string, unknown>) {
  const { data: current } = await supabase
    .from("shop_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (current) {
    await supabase.from("shop_settings").update(patch).eq("id", current.id);
  } else {
    await supabase.from("shop_settings").insert([patch]);
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [isReordering, setIsReorderingState] = useState(false);
  const isReorderingRef = useRef(false);

  const setIsReordering = (value: boolean) => {
    isReorderingRef.current = value;
    setIsReorderingState(value);
  };

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualStatus, setManualStatus] = useState<"auto" | "open" | "closed">(
    "auto",
  );
  const [isLunchPaused, setIsLunchPaused] = useState(false);
  const [isPreOpening, setIsPreOpening] = useState(false);
  const [estimatedTimes, setEstimatedTimes] = useState<Record<string, string>>(
    {},
  );

  const { shopName, logoUrl, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();
  const { isOpen: isShopOpen } = useShopStatus();

  const playUpdateSound = useCallback(() => {
    const audio = new Audio("/cash-register.mp3");
    audio
      .play()
      .catch((err) => console.warn("Áudio bloqueado pelo navegador:", err));
  }, []);

  const playWaitingAlertSound = useCallback(() => {
    // const audio = new Audio("/atencao.mp3");
    // audio
    //   .play()
    //   .catch((err) => console.warn("Áudio bloqueado pelo navegador:", err));
  }, []);

  const playServingTimeoutSound = useCallback(() => {
    // const audio = new Audio("/atencao.mp3");
    // audio
    //   .play()
    //   .catch((err) => console.warn("Áudio bloqueado pelo navegador:", err));
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
      setIsLunchPaused(data.is_lunch_paused ?? false);
      setIsPreOpening(data.is_pre_opening ?? false);
    } else if (!error) {
      const { data: newData } = await supabase
        .from("shop_settings")
        .insert([{ manual_status: "auto" }])
        .select()
        .single();
      if (newData) setManualStatus(newData.manual_status);
    }
  }, []);

  // Auth check
  useEffect(() => {
    const auth = sessionStorage.getItem("barber_admin_auth");
    if (auth === "true") {
      setIsAuthenticated(true);
    } else {
      setLoading(false);
    }
  }, []);

  // Realtime subscription + polling
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
            if (payload.eventType === "INSERT") playUpdateSound();
          },
        )
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "shop_settings" },
          () => fetchSettings(),
        )
        .subscribe();

      const pollInterval = setInterval(() => {
        fetchQueue();
        fetchSettings();
      }, 5000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
      };
    }
  }, [isAuthenticated, fetchQueue, fetchSettings, playUpdateSound]);

  // ETA computation (sync, uses queue already in state)
  useEffect(() => {
    if (queue.length === 0) {
      setEstimatedTimes({});
      return;
    }
    const servingCount = queue.filter((i) => i.status === "serving").length;
    const waitingItems = queue
      .filter((i) => i.status === "waiting")
      .sort((a, b) => a.position - b.position);
    const map: Record<string, string> = {};
    for (const item of queue) {
      if (item.status === "serving") {
        map[item.id] = "Agora";
      } else {
        const idx = waitingItems.findIndex((i) => i.id === item.id);
        map[item.id] = calculateEstimatedServiceTimeFromEntries(
          servingCount + idx + 1,
          queue,
        );
      }
    }
    setEstimatedTimes(map);
  }, [queue]);

  // Sound alerts — ref-based to avoid timer reset on every queue update
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const waitingAlert = useRef({ active: false, lastAt: 0 });
  const servingAlert = useRef({ active: false, lastAt: 0, servingId: null as string | null });

  useEffect(() => {
    if (!isAuthenticated) return;

    const check = () => {
      const q = queueRef.current;
      const now = Date.now();
      const FIVE_MIN = 5 * 60 * 1000;

      const waitingItems = q.filter((i) => i.status === "waiting");
      const hasServing = q.some((i) => i.status === "serving");
      const cond1 = waitingItems.length > 0 && !hasServing;

      const oldestWaitingTs = waitingItems.reduce((min, i) => {
        const t = new Date(i.created_at).getTime();
        return t < min ? t : min;
      }, Infinity);
      const waitingAgeMs = Number.isFinite(oldestWaitingTs)
        ? now - oldestWaitingTs
        : 0;

      const s1 = waitingAlert.current;
      const trigger1 =
        cond1 && waitingAgeMs >= FIVE_MIN && now - s1.lastAt >= FIVE_MIN;
      if (trigger1) {
        playWaitingAlertSound();
        const firstWaiting = [...waitingItems].sort(
          (a, b) => a.position - b.position,
        )[0];
        if (firstWaiting && webhookUrl) {
          webhookService.sendWebhook(
            "BARBER_ALERT_NO_SERVICE",
            firstWaiting,
            firstWaiting.position,
            waitingItems.length - 1,
            baseQueueTime ?? 30,
            shopName,
            webhookUrl,
            trackingUrlBase,
          );
        }
        s1.lastAt = now;
      }
      s1.active = cond1;

      const servingItem = q.find((i) => i.status === "serving");
      const cond2 =
        !!servingItem?.service_start &&
        new Date(servingItem.service_start).getTime() +
          (servingItem.service_duration ?? 30) * 60 * 1000 <
          now;
      const s2 = servingAlert.current;
      const customerChanged = servingItem?.id !== s2.servingId;
      const trigger2 =
        cond2 && (!s2.active || customerChanged || now - s2.lastAt >= 10 * 60 * 1000);
      if (trigger2 && servingItem) {
        playServingTimeoutSound();
        if (webhookUrl) {
          webhookService.sendWebhook(
            "BARBER_ALERT_OVERTIME",
            servingItem,
            0,
            0,
            baseQueueTime ?? 30,
            shopName,
            webhookUrl,
            trackingUrlBase,
          );
        }
        s2.lastAt = now;
        s2.servingId = servingItem.id;
      }
      s2.active = cond2;
    };

    check();
    const interval = setInterval(check, 30 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, playWaitingAlertSound, playServingTimeoutSound,
      webhookUrl, shopName, baseQueueTime, trackingUrlBase]);

  // Webhook notifications (position changes, ETA drift, delays)
  useWebhookNotifications({
    isAuthenticated,
    queue,
    baseQueueTime,
    shopName,
    webhookUrl,
    trackingUrlBase,
  });

  // Queue CRUD actions
  const {
    processingId,
    itemToRemove,
    setItemToRemove,
    handleStartService,
    handleCompleteService,
    handleRemove,
  } = useQueueActions({ queue, isLunchPaused, isPreOpening, fetchQueue });

  // Reorder handlers
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { index: from } = result.source;
    const { index: to } = result.destination;
    if (from === to) return;
    const newQueue = Array.from(localQueue);
    const [item] = newQueue.splice(from, 1);
    newQueue.splice(to, 0, item);
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
    } catch {
      toast.error("Falha ao salvar a nova ordem");
      setLoading(false);
    }
  };

  const handleCancelReorder = () => {
    setLocalQueue(queue);
    setIsReordering(false);
  };

  // Shop status toggles
  const handleToggleManualStatus = async () => {
    const next = { auto: "open", open: "closed", closed: "auto" } as const;
    const newStatus = next[manualStatus];
    if (isPreOpening && newStatus === "open") {
      toast.error("Encerre a pré-abertura antes de abrir a fila manualmente.");
      return;
    }
    if (isLunchPaused && newStatus === "closed") {
      toast.error("Encerre o horário de almoço antes de fechar a fila.");
      return;
    }
    try {
      await updateShopSettings({ manual_status: newStatus });
      setManualStatus(newStatus);
      const id = toast.success(
        `Fila em modo ${newStatus === "auto" ? "Automático" : newStatus === "open" ? "Aberto" : "Fechado"}`,
      );
      setTimeout(() => toast.dismiss(id), 1800);
    } catch {
      toast.error("Falha ao atualizar status da fila");
    }
  };

  const handleToggleLunchPause = async () => {
    if (!isLunchPaused) {
      if (isPreOpening) {
        toast.error(
          "Encerre a pré-abertura antes de ativar o horário de almoço.",
        );
        return;
      }
      const isQueueOpen =
        manualStatus === "open" || (manualStatus === "auto" && !!isShopOpen);
      if (!isQueueOpen) {
        toast.error(
          "A barbearia precisa estar aberta para ativar o horário de almoço.",
        );
        return;
      }
    }
    const newValue = !isLunchPaused;
    try {
      await updateShopSettings({ is_lunch_paused: newValue });
      setIsLunchPaused(newValue);
      const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;
      const servingCount = queue.filter((i) => i.status === "serving").length;
      const event = newValue ? "LUNCH_START" : "LUNCH_END";
      const items = newValue
        ? queue.filter((i) => i.status === "waiting" || i.status === "serving")
        : queue
            .filter((i) => i.status === "waiting")
            .sort((a, b) => a.position - b.position);
      for (let i = 0; i < items.length; i++) {
        const pos = servingCount + i + 1;
        await webhookService.sendWebhook(
          event,
          items[i],
          pos,
          pos - 1,
          currentBaseTime,
          shopName,
          webhookUrl,
          trackingUrlBase,
        );
      }
      const id = toast.success(
        newValue ? "Modo almoço ativado" : "Retorno do almoço ativado",
      );
      setTimeout(() => toast.dismiss(id), 1800);
    } catch {
      toast.error("Falha ao atualizar modo almoço");
    }
  };

  const handleTogglePreOpening = async () => {
    if (!isPreOpening) {
      if (manualStatus !== "auto") {
        toast.error("A pré-abertura só pode ser ativada no modo automático.");
        return;
      }
      if (isShopOpen) {
        toast.error("A barbearia já está no horário de funcionamento.");
        return;
      }
    }
    const newValue = !isPreOpening;
    try {
      await updateShopSettings({ is_pre_opening: newValue });
      setIsPreOpening(newValue);
      const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;
      const servingCount = queue.filter((i) => i.status === "serving").length;
      const event = newValue ? "PRE_OPENING_START" : "PRE_OPENING_END";
      const items = newValue
        ? queue.filter((i) => i.status === "waiting" || i.status === "serving")
        : queue
            .filter((i) => i.status === "waiting")
            .sort((a, b) => a.position - b.position);
      for (let i = 0; i < items.length; i++) {
        const pos = servingCount + i + 1;
        await webhookService.sendWebhook(
          event,
          items[i],
          pos,
          pos - 1,
          currentBaseTime,
          shopName,
          webhookUrl,
          trackingUrlBase,
        );
      }
      const id = toast.success(
        newValue ? "Modo pré-abertura ativado" : "Pré-abertura encerrada",
      );
      setTimeout(() => toast.dismiss(id), 1800);
    } catch {
      toast.error("Falha ao atualizar modo pré-abertura");
    }
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

  const itemToRemoveName =
    queue.find((i) => i.id === itemToRemove)?.customer?.name ?? "";

  return (
    <div className="min-h-screen bg-neutral-950 pb-20">
      <AdminHeader
        shopName={shopName}
        logoUrl={logoUrl ?? undefined}
        manualStatus={manualStatus}
        onToggleManualStatus={handleToggleManualStatus}
        isLunchPaused={isLunchPaused}
        onToggleLunch={handleToggleLunchPause}
        isPreOpening={isPreOpening}
        onTogglePreOpening={handleTogglePreOpening}
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
          estimatedTimes={estimatedTimes}
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
