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
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useQueueCount } from "../hooks/useQueue";
import { QueueItem, supabase } from "../lib/supabase";

import { useShopSettings } from "../hooks/useShopSettings";
import { webhookService } from "../services/webhookService";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [isReordering, setIsReorderingState] = useState(false);
  const isReorderingRef = useRef(false);

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
          () => {
            fetchQueue();
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
  }, [isAuthenticated, fetchQueue, fetchSettings]);

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
      console.error(error);
      toast.error("Falha ao atualizar status da fila");
    }
  };

  useEffect(() => {
    if (isAuthenticated && queue.length > 0) {
      const processWebhooks = async () => {
        const servingCount = queue.filter(
          (item) => item.status === "serving",
        ).length;
        const waitingItems = queue
          .filter((item) => item.status === "waiting")
          .sort((a, b) => a.position - b.position);

        const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;
        for (let index = 0; index < waitingItems.length; index++) {
          const item = waitingItems[index];
          const position = index + 1 + servingCount;
          const peopleAhead = position - 1;

          let sent = false;
          if (peopleAhead <= 1) {
            sent = await webhookService.sendWebhook(
              "NEXT",
              item,
              position,
              peopleAhead,
              currentBaseTime,
              shopName,
              webhookUrl,
              trackingUrlBase,
            );
          } else if (peopleAhead === 2) {
            sent = await webhookService.sendWebhook(
              "NEAR",
              item,
              position,
              peopleAhead,
              currentBaseTime,
              shopName,
              webhookUrl,
              trackingUrlBase,
            );
          }

          if (sent) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      };

      processWebhooks();
    }
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
      await fetchQueue();
    } catch (error) {
      console.error(error);
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
      await fetchQueue();
    } catch (error) {
      console.error(error);
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
      await fetchQueue();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao remover cliente");
    } finally {
      setProcessingId(null);
    }
  };

  const handleMove = async (item: QueueItem, direction: "up" | "down") => {
    if (processingId) return;
    const index = queue.findIndex((i) => i.id === item.id);
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === queue.length - 1) return;

    const otherItem = direction === "up" ? queue[index - 1] : queue[index + 1];

    setProcessingId(item.id);
    try {
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
      const updates = localQueue.map((item, index) => {
        return supabase
          .from("queue")
          .update({ position: index + 1 })
          .eq("id", item.id);
      });

      await Promise.all(updates);

      toast.success("Ordem da fila atualizada!");
      setIsReordering(false);
      fetchQueue();
    } catch (error) {
      console.error(error);
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 p-4 dark:bg-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm space-y-8 rounded-3xl bg-white p-8 shadow-2xl dark:bg-neutral-900"
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
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {shopName} Admin
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400">
              Digite seu PIN de 4 dígitos para acessar
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <input
              type="password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="h-16 w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 text-center text-3xl font-bold tracking-[1em] focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 outline-none transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              autoFocus
            />
            <button
              type="submit"
              className="h-14 w-full rounded-2xl bg-neutral-900 font-bold text-white shadow-lg transition-all hover:bg-neutral-800 active:scale-95 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              Desbloquear Painel
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 dark:bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md dark:bg-neutral-900/80 dark:border-neutral-800">
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
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
              Painel Admin
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleToggleManualStatus}
              className={`flex items-center sm:space-x-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                manualStatus === "auto"
                  ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  : manualStatus === "open"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
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
              className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 transition-colors dark:text-neutral-400 dark:hover:bg-neutral-800"
              title="Histórico"
            >
              <History className="h-6 w-6" />
            </button>
            <button
              onClick={() => navigate("/admin/settings")}
              className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 transition-colors dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <Settings className="h-6 w-6" />
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem("barber_admin_auth");
                setIsAuthenticated(false);
              }}
              className="rounded-xl p-2 text-red-500 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <LogOut className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <p className="text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
              Na Fila
            </p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">
              {queue.length}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <p className="text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
              Tempo Base
            </p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">
              {baseQueueTime == null ? 30 : baseQueueTime}m
            </p>
          </div>
          <div className="col-span-2 rounded-2xl bg-emerald-600 p-4 text-white shadow-lg shadow-emerald-100 dark:shadow-none">
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
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Fila ao Vivo
            </h2>
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
                      className="flex items-center rounded-xl bg-neutral-100 px-3 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-200 transition-all dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                    >
                      <X className="mr-1 h-4 w-4" />
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveOrder}
                      className="flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all dark:shadow-none"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      Salvar Ordem
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-neutral-800 transition-all dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:shadow-none"
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
                                  ? "border-emerald-200 bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-500/50 dark:ring-emerald-500/50"
                                  : snapshot.isDragging
                                    ? "border-emerald-400 bg-emerald-50 shadow-xl scale-[1.02] z-50 dark:bg-emerald-900/30 dark:border-emerald-500"
                                    : "border-neutral-100 bg-white hover:border-neutral-200 hover:shadow-md dark:bg-neutral-900 dark:border-neutral-800 dark:hover:border-neutral-700"
                              }`}
                              style={{
                                ...provided.draggableProps.style,
                              }}
                            >
                              <div className="flex items-center space-x-4">
                                {item.status === "waiting" && (
                                  <div
                                    {...provided.dragHandleProps}
                                    className="cursor-grab active:cursor-grabbing p-2 text-neutral-300 hover:text-neutral-500 transition-colors dark:text-neutral-700 dark:hover:text-neutral-500"
                                  >
                                    <GripVertical className="h-5 w-5" />
                                  </div>
                                )}
                                <div
                                  className={`flex h-12 w-auto p-2 shrink-0 items-center justify-center rounded-xl font-black ${
                                    item.status === "serving"
                                      ? "bg-emerald-600 text-white"
                                      : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                                  }`}
                                >
                                  {item.code}
                                </div>
                                <div>
                                  <h3 className="font-bold text-neutral-900 dark:text-white">
                                    {item.customer?.name}
                                  </h3>
                                  <p className="text-xs text-neutral-500 dark:text-neutral-500">
                                    {item.customer?.phone}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2">
                                {item.customer?.phone && (
                                  <a
                                    href={`https://wa.me/${item.customer.phone.replace(/\D/g, "").startsWith("55") ? item.customer.phone.replace(/\D/g, "") : "55" + item.customer.phone.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all dark:bg-emerald-900/20 dark:text-emerald-500 dark:hover:bg-emerald-900/40"
                                    title="Contactar via WhatsApp"
                                  >
                                    <MessageCircle className="h-5 w-5" />
                                  </a>
                                )}
                                {item.status === "serving" && (
                                  <button
                                    onClick={() => handleCompleteService(item)}
                                    disabled={!!processingId}
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50 dark:shadow-none"
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
                                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50 dark:shadow-none"
                                      title="Start Service"
                                    >
                                      <Play className="h-5 w-5 fill-current" />
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => setItemToRemove(item.id)}
                                  disabled={!!processingId}
                                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50 dark:bg-red-900/20 dark:text-red-500 dark:hover:bg-red-900/40"
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
              <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-600">
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
              className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl dark:bg-neutral-900"
            >
              <h2 className="mb-6 text-2xl font-bold text-neutral-900 dark:text-white">
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
              className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-center dark:bg-neutral-900"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500">
                <Trash2 className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-neutral-900 dark:text-white">
                Remover da Fila?
              </h2>
              <p className="mb-8 text-neutral-500 dark:text-neutral-400">
                Esta ação não pode ser desfeita. O cliente será removido da
                lista de espera.
              </p>

              <div className="flex space-x-3">
                <button
                  onClick={() => setItemToRemove(null)}
                  className="h-12 flex-1 rounded-xl bg-neutral-100 font-bold text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleRemove(itemToRemove)}
                  disabled={!!processingId}
                  className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white shadow-lg shadow-red-100 hover:bg-red-700 disabled:opacity-50 dark:shadow-none"
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
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const queueCount = useQueueCount();
  const { shopName, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Create/Get customer
      const cleanPhone = phone.replace(/\D/g, "");
      let customerId;
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", cleanPhone)
        .maybeSingle();
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: created } = await supabase
          .from("customers")
          .insert([{ name, phone: cleanPhone }])
          .select()
          .single();
        customerId = created.id;
      }

      // 2. Get next position
      const { data: last, error: lastError } = await supabase
        .from("queue")
        .select("position, code")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw lastError;

      const nextPos = (last?.position || 0) + 1;

      let nextCode = "A001";
      if (last && last.code) {
        const lastCodeNum = parseInt(last.code.substring(1));
        if (!isNaN(lastCodeNum)) {
          nextCode = `A${String(lastCodeNum + 1).padStart(3, "0")}`;
        }
      }

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
      webhookService.sendWebhook(
        "JOINED",
        queueEntry,
        nextPos,
        peopleAhead,
        currentBaseTime,
        shopName,
        webhookUrl,
        trackingUrlBase,
      );

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
        <label className="mb-1 block text-sm font-bold text-neutral-700 dark:text-neutral-400">
          Nome
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 outline-none focus:border-emerald-500 focus:bg-white dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700 dark:text-neutral-400">
          Telefone (Opcional)
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 outline-none focus:border-emerald-500 focus:bg-white dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500"
        />
      </div>
      <div className="flex space-x-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-xl bg-neutral-100 font-bold text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-12 flex-1 rounded-xl bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700 disabled:opacity-50 dark:shadow-none"
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
