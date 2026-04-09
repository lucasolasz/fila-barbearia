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
    const interval = setInterval(checkStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return { isOpen, message, loading };
}

function roundDateUpTo15(date: Date): Date {
  const d = new Date(date);

  const minutes = d.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;

  if (rounded === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(rounded);
  }

  d.setSeconds(0);
  d.setMilliseconds(0);

  return d;
}

function roundDateDownTo15(date: Date): Date {
  const d = new Date(date);

  const minutes = d.getMinutes();
  const rounded = Math.floor(minutes / 15) * 15;

  d.setMinutes(rounded);
  d.setSeconds(0);
  d.setMilliseconds(0);

  return d;
}

export function calculateEstimatedServiceTime(posicaoNaFila: number): string {
  if (posicaoNaFila <= 1) return "Agora";

  // ⏱ intervalo real do serviço
  const tempoMin = 25;
  const tempoMax = 40;

  const pessoasNaFrente = posicaoNaFila - 1;

  const minimo = pessoasNaFrente * tempoMin;
  const maximo = pessoasNaFrente * tempoMax;

  const now = new Date();

  let minTime = addMinutes(now, minimo);
  let maxTime = addMinutes(now, maximo);

  // 👉 arredondamento correto
  minTime = roundDateUpTo15(minTime);
  maxTime = roundDateDownTo15(maxTime);

  // 👉 proteção contra inversão (bug 22:00 e 21:45)
  if (maxTime < minTime) {
    maxTime = new Date(minTime.getTime() + 15 * 60000);
  }

  // 👉 evita intervalo igual (ex: 10:30 e 10:30)
  if (maxTime.getTime() === minTime.getTime()) {
    maxTime = new Date(minTime.getTime() + 15 * 60000);
  }

  return `${format(minTime, "HH:mm")} e ${format(maxTime, "HH:mm")}`;
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
  const [avgTime, setAvgTime] = useState(30);

  useEffect(() => {
    async function fetchAvg() {
      const { data, error } = await supabase
        .from("services")
        .select("duration_minutes")
        .order("created_at", { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        const sum = data.reduce(
          (acc: any, curr: any) => acc + curr.duration_minutes,
          0,
        );
        setAvgTime(Math.round(sum / data.length));
      }
    }
    fetchAvg();
  }, []);

  return avgTime;
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
