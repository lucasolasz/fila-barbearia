import { useState, useEffect } from "react";
import { supabase, Schedule, ScheduleException, QueueItem } from "../lib/supabase";
import { format, getDay, addMinutes } from "date-fns";
import { DEFAULT_SERVICE_MINUTES, roundToNearest5 } from "../lib/schedule";

export function useShopStatus() {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>("");
  const [closeTime, setCloseTime] = useState<string | null>(null);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [preOpeningMinutes, setPreOpeningMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const now = new Date();
        const todayStr = format(now, "yyyy-MM-dd");
        const weekday = getDay(now);
        const currentTime = format(now, "HH:mm:ss");

        // 1. Check manual override first
        const { data: settings } = await supabase
          .from("shop_settings")
          .select("manual_status")
          .limit(1)
          .maybeSingle();

        if (settings && settings.manual_status !== "auto") {
          if (settings.manual_status === "open") {
            setIsOpen(true);
            setMessage("");
          } else {
            setIsOpen(false);
            setMessage(
              "A barbearia está fechada manualmente pelo administrador.",
            );
          }
          setCloseTime(null);
          setOpenTime(null);
          setPreOpeningMinutes(null);
          setLoading(false);
          return;
        }

        // 2. Check exceptions
        const { data: exception } = await supabase
          .from("schedule_exceptions")
          .select("*")
          .eq("date", todayStr)
          .maybeSingle();

        if (exception) {
          if (exception.is_closed) {
            setIsOpen(false);
            setCloseTime(null);
            setOpenTime(null);
            setPreOpeningMinutes(null);
            setMessage(
              "A barbearia está fechada hoje devido a um feriado ou evento especial.",
            );
          } else if (exception.open_time && exception.close_time) {
            const open = exception.open_time;
            const close = exception.close_time;
            setCloseTime(close);
            setOpenTime(open);
            setPreOpeningMinutes(exception.pre_opening_minutes ?? null);
            if (currentTime >= open && currentTime <= close) {
              setIsOpen(true);
            } else {
              setIsOpen(false);
              setMessage(
                `A barbearia está fechada. Horário especial de hoje: ${open.slice(0, 5)} - ${close.slice(0, 5)}`,
              );
            }
          }
        } else {
          // Check regular schedule
          const { data: schedule, error: schedError } = await supabase
            .from("barbershop_schedule")
            .select("*")
            .eq("weekday", weekday)
            .maybeSingle();

          if (schedule) {
            if (schedule.is_closed) {
              setIsOpen(false);
              setCloseTime(null);
              setOpenTime(null);
              setPreOpeningMinutes(null);
              setMessage("A barbearia está fechada hoje.");
            } else if (schedule.open_time && schedule.close_time) {
              const open = schedule.open_time;
              const close = schedule.close_time;
              setCloseTime(close);
              setOpenTime(open);
              setPreOpeningMinutes(schedule.pre_opening_minutes ?? null);
              if (currentTime >= open && currentTime <= close) {
                setIsOpen(true);
              } else {
                setIsOpen(false);
                setMessage(
                  `A barbearia está fechada. Horário normal: ${open.slice(0, 5)} - ${close.slice(0, 5)}`,
                );
              }
            } else {
              // Schedule exists but no times set
              setIsOpen(true);
              setCloseTime(null);
              setOpenTime(null);
              setPreOpeningMinutes(null);
            }
          } else {
            // No schedule found for today, default to open so app is usable
            setIsOpen(true);
            setCloseTime(null);
            setOpenTime(null);
            setPreOpeningMinutes(null);
            if (schedError) {
              console.warn(
                "Schedule table might not be initialized:",
                schedError,
              );
            }
          }
        }
      } catch (error) {
        console.error("Error checking shop status:", error);
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 60000);

    const channel = supabase
      .channel("shop_status_updates")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "shop_settings" }, () => checkStatus())
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "barbershop_schedule" }, () => checkStatus())
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "schedule_exceptions" }, () => checkStatus())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return { isOpen, message, closeTime, openTime, preOpeningMinutes, loading };
}

/* -------------------------------------------------------------------------- */
/* Primitivas da fila                                                          */
/* -------------------------------------------------------------------------- */

/** Media usada como fallback quando nao da para calcular pela fila real. */
const FALLBACK_AVG_MINUTES = 37;

/** Entradas ativas (waiting + serving) ordenadas por posicao. */
async function fetchActiveQueue(): Promise<QueueItem[]> {
  const { data } = await supabase
    .from("queue")
    .select("position, status, service_start, service_duration")
    .in("status", ["waiting", "serving"])
    .order("position", { ascending: true });

  return (data ?? []) as QueueItem[];
}

/** A entrada que esta em atendimento agora, se houver. */
function findServingEntry(entries: QueueItem[]): QueueItem | undefined {
  return entries.find((entry: QueueItem) => entry.status === "serving");
}

/** Entradas que estao a frente de quem ocupa `posicaoNaFila`. */
function entriesAhead(entries: QueueItem[], posicaoNaFila: number): QueueItem[] {
  const servingCount = findServingEntry(entries) ? 1 : 0;
  const waiting = entries.filter((entry: QueueItem) => entry.status === "waiting");
  return waiting.slice(0, Math.max(0, posicaoNaFila - 1 - servingCount));
}

/** Soma das duracoes previstas de uma lista de entradas. */
function sumDurations(entries: QueueItem[]): number {
  return entries.reduce(
    (total: number, entry: QueueItem) =>
      total + (entry.service_duration ?? DEFAULT_SERVICE_MINUTES),
    0,
  );
}

/**
 * Minutos que ainda faltam para esta entrada terminar.
 *
 * Uma entrada em atendimento sem `service_start` conta a duracao inteira,
 * porque nao da para saber quando comecou.
 */
function remainingMinutes(entry: QueueItem, now: Date): number {
  const duration = entry.service_duration ?? DEFAULT_SERVICE_MINUTES;
  if (entry.status !== "serving" || !entry.service_start) return duration;

  const elapsed = Math.max(
    0,
    Math.round((now.getTime() - new Date(entry.service_start).getTime()) / 60000),
  );
  return Math.max(0, duration - elapsed);
}

/**
 * Instante em que a cadeira fica livre: o fim projetado de quem esta em
 * atendimento, ou agora — inclusive quando o atendimento ja passou do previsto.
 */
function nextFreeSlot(servingEntry: QueueItem | undefined, now: Date): Date {
  if (!servingEntry?.service_start) return now;

  const projectedEnd = addMinutes(
    new Date(servingEntry.service_start),
    servingEntry.service_duration ?? DEFAULT_SERVICE_MINUTES,
  );
  return projectedEnd.getTime() > now.getTime() ? projectedEnd : now;
}

/* -------------------------------------------------------------------------- */
/* Estimativas de atendimento                                                  */
/* -------------------------------------------------------------------------- */

/** Estimativa grosseira por media fixa, usada quando a fila real nao esta disponivel. */
export function calculateEstimatedServiceTime(
  posicaoNaFila: number,
  avgDuration = FALLBACK_AVG_MINUTES,
): string {
  if (posicaoNaFila <= 1) return "Agora";

  const pessoasNaFrente = posicaoNaFila - 1;
  const rawTime = addMinutes(new Date(), pessoasNaFrente * avgDuration);
  return format(roundToNearest5(rawTime), "HH:mm");
}

/** Horario estimado de inicio para `posicaoNaFila`, a partir de entradas ja carregadas. */
export function calculateEstimatedServiceTimeFromEntries(
  posicaoNaFila: number,
  activeEntries: QueueItem[],
): string {
  const servingEntry = findServingEntry(activeEntries);

  if (!servingEntry && posicaoNaFila <= 1) return "Agora";
  if (posicaoNaFila <= 0) return "Agora";

  const now = new Date();
  const baseStart = nextFreeSlot(servingEntry, now);
  const rawStart = addMinutes(
    baseStart,
    sumDurations(entriesAhead(activeEntries, posicaoNaFila)),
  );

  return format(roundToNearest5(rawStart), "HH:mm");
}

/** Horario estimado de inicio para `posicaoNaFila`, consultando a fila no banco. */
export async function calculateEstimatedServiceTimeDynamic(
  posicaoNaFila: number,
): Promise<string> {
  try {
    const activeEntries = await fetchActiveQueue();
    if (activeEntries.length === 0) return "Agora";

    return calculateEstimatedServiceTimeFromEntries(posicaoNaFila, activeEntries);
  } catch (error) {
    console.error("Error calculating dynamic ETA:", error);
    return calculateEstimatedServiceTime(posicaoNaFila);
  }
}

/** Minutos de espera ate `posicaoNaFila` ser chamada. */
export async function calculateEstimatedMinutes(
  posicaoNaFila: number,
): Promise<number> {
  if (posicaoNaFila <= 0) return 0;

  try {
    const activeEntries = await fetchActiveQueue();
    const servingEntry = findServingEntry(activeEntries);

    if (!servingEntry && posicaoNaFila <= 1) return 0;

    const now = new Date();
    const remainingCurrent = servingEntry ? remainingMinutes(servingEntry, now) : 0;
    const waitingMinutes = sumDurations(entriesAhead(activeEntries, posicaoNaFila));

    return Math.max(0, Math.round(remainingCurrent + waitingMinutes));
  } catch (error) {
    console.error("Error calculating dynamic ETA minutes:", error);
    return Math.max(0, (posicaoNaFila - 1) * FALLBACK_AVG_MINUTES);
  }
}

/**
 * Minutos ate a fila atual esvaziar por completo.
 *
 * Nao recebe posicao de proposito: quem ainda nao entrou sempre cai no fim da
 * fila, entao o valor nao depende do contador da tela.
 */
export async function fetchQueueTailWaitMinutes(): Promise<number> {
  const entries = await fetchActiveQueue();
  const now = new Date();

  return entries.reduce(
    (total: number, entry: QueueItem) => total + remainingMinutes(entry, now),
    0,
  );
}

/* -------------------------------------------------------------------------- */
/* Hooks auxiliares                                                            */
/* -------------------------------------------------------------------------- */

export function useQueueCount() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCount() {
      const { count: queueCount, error } = await supabase
        .from("queue")
        .select("*", { count: "exact", head: true })
        .in("status", ["waiting", "serving"]);

      if (!error && queueCount !== null) {
        setCount(queueCount);
      }
    }

    fetchCount();

    const channel = supabase
      .channel("public:queue_count")
      .on("postgres_changes" as any, { event: "*", table: "queue" }, () => {
        fetchCount();
      })
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchCount();
    }, 45000); // fallback de seguranca; realtime ja cobre atualizacao em tempo real

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  return count;
}

export function useAverageServiceTime() {
  return FALLBACK_AVG_MINUTES;
}

/** Faixa "min - max" mostrada ao cliente, baseada no tempo base configurado no admin. */
export function calculateEstimatedWaitTime(
  posicaoNaFila: number,
  baseQueueTime: number | null,
): string {
  if (posicaoNaFila <= 0) return "0 min";

  const tempoBase = baseQueueTime ?? DEFAULT_SERVICE_MINUTES;
  const tempoEstimado = posicaoNaFila * tempoBase;
  const margem = Math.floor(tempoEstimado * 0.2);

  const minimo = Math.max(tempoEstimado - margem, 5);
  const maximo = tempoEstimado + margem;
  return `${minimo} - ${maximo} min`;
}
