import { useState, useEffect } from "react";
import { supabase, Schedule, ScheduleException } from "../lib/supabase";
import { format, getDay, parseISO, addMinutes } from "date-fns";

export function useShopStatus() {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>("");
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
          setLoading(false);
          return;
        }

        // 2. Check exceptions
        const { data: exception } = await supabase
          .from("schedule_exceptions")
          .select("*")
          .eq("date", todayStr)
          .single();

        if (exception) {
          if (exception.is_closed) {
            setIsOpen(false);
            setMessage(
              "A barbearia está fechada hoje devido a um feriado ou evento especial.",
            );
          } else if (exception.open_time && exception.close_time) {
            const open = exception.open_time;
            const close = exception.close_time;
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
              setMessage("A barbearia está fechada hoje.");
            } else if (schedule.open_time && schedule.close_time) {
              const open = schedule.open_time;
              const close = schedule.close_time;
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
            }
          } else {
            // No schedule found for today, default to open so app is usable
            setIsOpen(true);
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

  return { isOpen, message, loading };
}

function roundToNearest5(date: Date): Date {
  const d = new Date(date);
  const minutes = d.getMinutes();
  const rounded = Math.round(minutes / 5) * 5;
  if (rounded >= 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(rounded - 60);
  } else {
    d.setMinutes(rounded);
  }
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

export function calculateEstimatedServiceTime(
  posicaoNaFila: number,
  avgDuration = 37,
): string {
  if (posicaoNaFila <= 1) return "Agora";

  const pessoasNaFrente = posicaoNaFila - 1;
  const totalMinutes = pessoasNaFrente * avgDuration;
  const now = new Date();
  const rawTime = addMinutes(now, totalMinutes);
  return format(roundToNearest5(rawTime), "HH:mm");
}

export async function calculateEstimatedServiceTimeDynamic(
  posicaoNaFila: number,
): Promise<string> {
  const now = new Date();

  try {
    const { data: activeEntries } = await supabase
      .from("queue")
      .select("position, status, service_start, service_duration")
      .in("status", ["waiting", "serving"])
      .order("position", { ascending: true });

    if (!activeEntries || activeEntries.length === 0) return "Agora";

    const servingEntry = activeEntries.find((e) => e.status === "serving");
    const servingCount = servingEntry ? 1 : 0;

    if (!servingEntry && posicaoNaFila <= 1) return "Agora";
    if (posicaoNaFila <= 0) return "Agora";

    let baseStart: Date;

    if (servingEntry?.service_start) {
      const duration = servingEntry.service_duration ?? 30;
      const started = new Date(servingEntry.service_start);
      const projectedEnd = addMinutes(started, duration);
      if (projectedEnd.getTime() > now.getTime()) {
        baseStart = projectedEnd;
      } else {
        baseStart = addMinutes(now, 10);
      }
    } else {
      baseStart = now;
    }

    const waitingEntries = activeEntries.filter((e) => e.status === "waiting");
    const waitingAheadEntries = waitingEntries.slice(
      0,
      Math.max(0, posicaoNaFila - 1 - servingCount),
    );
    const shiftByMinutes = waitingAheadEntries.reduce(
      (sum, e) => sum + (e.service_duration ?? 30),
      0,
    );

    const rawStart = addMinutes(baseStart, shiftByMinutes);
    return format(roundToNearest5(rawStart), "HH:mm");
  } catch (error) {
    console.error("Error calculating dynamic ETA:", error);
    return calculateEstimatedServiceTime(posicaoNaFila);
  }
}

export async function calculateEstimatedMinutes(
  posicaoNaFila: number,
): Promise<number> {
  if (posicaoNaFila <= 0) return 0;

  try {
    const { data: activeEntries } = await supabase
      .from("queue")
      .select("position, status, service_start, service_duration")
      .in("status", ["waiting", "serving"])
      .order("position", { ascending: true });

    if (!activeEntries) return 0;

    const servingEntry = activeEntries.find((e) => e.status === "serving");
    const servingCount = servingEntry ? 1 : 0;

    if (!servingEntry && posicaoNaFila <= 1) return 0;

    const now = new Date();
    let remainingCurrent = 0;

    if (servingEntry?.service_start) {
      const duration = servingEntry.service_duration ?? 30;
      const started = new Date(servingEntry.service_start);
      const elapsed = Math.max(
        0,
        Math.round((now.getTime() - started.getTime()) / 60000),
      );
      remainingCurrent = duration - elapsed > 0 ? duration - elapsed : 10;
    } else if (servingEntry) {
      remainingCurrent = servingEntry.service_duration ?? 30;
    }

    const waitingEntries = activeEntries.filter((e) => e.status === "waiting");
    const waitingAheadEntries = waitingEntries.slice(
      0,
      Math.max(0, posicaoNaFila - 1 - servingCount),
    );
    const waitingMinutes = waitingAheadEntries.reduce(
      (sum, e) => sum + (e.service_duration ?? 30),
      0,
    );

    return Math.max(0, Math.round(remainingCurrent + waitingMinutes));
  } catch (error) {
    console.error("Error calculating dynamic ETA minutes:", error);
    return Math.max(0, (posicaoNaFila - 1) * 37);
  }
}

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
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  return count;
}

export function useAverageServiceTime() {
  return 37;
}

export function calculateEstimatedWaitTime(
  posicaoNaFila: number,
  baseQueueTime: number | null,
): string {
  if (posicaoNaFila <= 0) return "0 min";
  const tempoBase = baseQueueTime == null ? 30 : baseQueueTime;
  const tempoEstimado = posicaoNaFila * tempoBase;
  const margem = Math.floor(tempoEstimado * 0.2);
  let minimo = Math.max(tempoEstimado - margem, 5);
  let maximo = tempoEstimado + margem;
  return `${minimo} - ${maximo} min`;
}
