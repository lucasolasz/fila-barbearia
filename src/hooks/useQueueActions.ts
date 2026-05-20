import { useState } from "react";
import toast from "react-hot-toast";
import { QueueItem, supabase } from "../lib/supabase";

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

interface Params {
  queue: QueueItem[];
  isLunchPaused: boolean;
  isPreOpening: boolean;
  fetchQueue: () => Promise<void>;
}

export function useQueueActions({
  queue,
  isLunchPaused,
  isPreOpening,
  fetchQueue,
}: Params) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);

  const handleStartService = async (item: QueueItem) => {
    if (isLunchPaused) {
      toast.error("Desative o modo almoço antes de iniciar um atendimento.");
      return;
    }
    if (isPreOpening) {
      toast.error("Encerre a pré-abertura antes de iniciar um atendimento.");
      return;
    }
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
          .update({ status: "completed", service_end: endTime.toISOString() })
          .eq("id", servingItem.id);
        await supabase.from("services").insert([
          { customer_id: servingItem.customer_id, duration_minutes: duration },
        ]);
      }
      await supabase
        .from("queue")
        .update({ status: "serving", service_start: new Date().toISOString() })
        .eq("id", item.id);
      toast.success(`Iniciou atendimento para ${item.customer?.name}`);
      await normalizeQueuePositions();
      await fetchQueue();
    } catch {
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
        { customer_id: item.customer_id, duration_minutes: duration },
      ]);
      toast.success(`Atendimento de ${item.customer?.name} finalizado!`);
      await normalizeQueuePositions();
      await fetchQueue();
    } catch {
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
    } catch {
      toast.error("Falha ao remover cliente");
    } finally {
      setProcessingId(null);
    }
  };

  return {
    processingId,
    itemToRemove,
    setItemToRemove,
    handleStartService,
    handleCompleteService,
    handleRemove,
  };
}
