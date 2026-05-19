import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleAlert,
  Clock,
  Loader2,
  Phone,
  Scissors,
  User,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  calculateEstimatedServiceTimeDynamic,
  useQueueCount,
  useShopStatus,
} from "../hooks/useQueue";
import { supabase } from "../lib/supabase";

import { BARBER_SERVICES, DDD_OPTIONS, ServiceId } from "../constants/constants";
import { useShopSettings } from "../hooks/useShopSettings";
import { webhookService } from "../services/webhookService";
import { getQueueId, getQueueCode, setQueueSession, clearQueueSession } from "../lib/storage";

function generateCode(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const allChars = letters + numbers;
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  if (!/\d/.test(code)) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  } else {
    code += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  return code
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

function calculatePersonDuration(services: ServiceId[]): number {
  return services.reduce((sum, id) => {
    const svc = BARBER_SERVICES.find((s) => s.id === id);
    return sum + (svc?.duration ?? 0);
  }, 0);
}

export default function Home() {
  const [ddd, setDdd] = useState(() => {
    const savedPhone = localStorage.getItem("barber_customer_phone");
    return savedPhone && savedPhone.length > 2
      ? savedPhone.substring(0, 2)
      : "21";
  });
  const [phone, setPhone] = useState(() => {
    const savedPhone = localStorage.getItem("barber_customer_phone");
    return savedPhone && savedPhone.length > 2 ? savedPhone.substring(2) : "";
  });
  const [name, setName] = useState(() => {
    return localStorage.getItem("barber_customer_name") || "";
  });
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dialogStep, setDialogStep] = useState<number | null>(null);
  const [servicesPerPerson, setServicesPerPerson] = useState<ServiceId[][]>([]);
  const { isOpen, message, loading: statusLoading } = useShopStatus();
  const queueCount = useQueueCount();
  const navigate = useNavigate();
  const { shopName, logoUrl, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();
  const [maxQueueTime, setMaxQueueTime] = useState("19:00");

  useEffect(() => {
    async function fetchMaxTime() {
      const { data } = await supabase
        .from("shop_settings")
        .select("max_queue_time")
        .maybeSingle();
      if (data?.max_queue_time) {
        setMaxQueueTime(data.max_queue_time);
      }
    }
    fetchMaxTime();
  }, []);

  useEffect(() => {
    if (statusLoading) return;

    const storedQueueId = getQueueId();
    const storedCode = getQueueCode();

    if (!storedQueueId || !storedCode) return;

    supabase
      .from("queue")
      .select("id, status")
      .eq("id", storedQueueId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error && error.code !== "PGRST116") return;
        if (!data) {
          clearQueueSession();
          return;
        }
        if (data.status === "waiting" || data.status === "serving") {
          navigate("/queue");
        }
      });
  }, [statusLoading, navigate]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 9 || !phone.startsWith("9")) {
      toast.error(
        "Por favor, insira um número de celular válido (9 dígitos, iniciando com 9)",
      );
      return;
    }
    if (!name.trim()) {
      toast.error("Por favor, insira seu nome");
      return;
    }
    const initial: ServiceId[][] = Array.from({ length: numberOfPeople }, () => [
      "cabelo",
    ]);
    setServicesPerPerson(initial);
    setDialogStep(0);
  };

  const handleDialogNext = () => {
    if (dialogStep === null) return;
    if (dialogStep < numberOfPeople - 1) {
      setDialogStep(dialogStep + 1);
    } else {
      setDialogStep(null);
      handleJoinSubmit();
    }
  };

  const toggleService = (personIndex: number, serviceId: ServiceId) => {
    setServicesPerPerson((prev) => {
      const updated = prev.map((s) => [...s]);
      const idx = updated[personIndex].indexOf(serviceId);
      if (idx >= 0) {
        updated[personIndex].splice(idx, 1);
      } else {
        updated[personIndex].push(serviceId);
      }
      return updated;
    });
  };

  const handleJoinSubmit = async () => {
    setLoading(true);
    const fullPhone = `${ddd}${phone}`;

    try {
      let customerId: string;
      const { data: existingCustomer, error: fetchError } = await supabase
        .from("customers")
        .select("id, name")
        .eq("phone", fullPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingCustomer) {
        customerId = existingCustomer.id;

        const { data: activeEntry } = await supabase
          .from("queue")
          .select("*")
          .eq("customer_id", customerId)
          .in("status", ["waiting", "serving"])
          .maybeSingle();

        if (activeEntry) {
          toast.success("Você já está na fila!");
          localStorage.setItem("barber_customer_id", customerId);
          setQueueSession(activeEntry.id, activeEntry.code);
          localStorage.setItem("barber_customer_phone", fullPhone);
          localStorage.setItem("barber_customer_name", name);
          navigate("/queue");
          return;
        }

        const { error: updateError } = await supabase
          .from("customers")
          .update({ name: name.trim() })
          .eq("id", customerId);
        if (updateError) throw updateError;
      } else {
        const { data: newCustomer, error: createError } = await supabase
          .from("customers")
          .insert([{ name: name.trim(), phone: fullPhone }])
          .select()
          .single();
        if (createError) throw createError;
        customerId = newCustomer.id;
      }

      if (!customerId)
        throw new Error("Não foi possível identificar o cliente.");

      const { data: lastEntry, error: lastEntryError } = await supabase
        .from("queue")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEntryError) throw lastEntryError;

      const nextPosition = (lastEntry?.position || 0) + 1;

      const mainServices = servicesPerPerson[0] ?? (["cabelo"] as ServiceId[]);
      const mainDuration = calculatePersonDuration(mainServices) || 30;

      const { data: queueEntry, error: queueError } = await supabase
        .from("queue")
        .insert([
          {
            customer_id: customerId,
            code: generateCode(),
            position: nextPosition,
            status: "waiting",
            service_duration: mainDuration,
          },
        ])
        .select("*, customer:customer_id(*)")
        .single();

      if (queueError) throw queueError;
      if (!queueEntry) throw new Error("Falha ao confirmar entrada na fila.");

      for (let i = 1; i < numberOfPeople; i++) {
        const guestPhone = `manual_${Date.now()}_${i}`;
        const guestName = `Convidado de ${name.trim()}`;

        const { data: guestCustomer, error: guestErr } = await supabase
          .from("customers")
          .insert([{ name: guestName, phone: guestPhone }])
          .select()
          .single();
        if (guestErr) throw guestErr;

        const guestServices =
          servicesPerPerson[i] ?? (["cabelo"] as ServiceId[]);
        const guestDuration = calculatePersonDuration(guestServices) || 30;

        const { error: guestQueueErr } = await supabase.from("queue").insert([
          {
            customer_id: guestCustomer.id,
            code: generateCode(),
            position: nextPosition + i,
            status: "waiting",
            service_duration: guestDuration,
          },
        ]);
        if (guestQueueErr) throw guestQueueErr;
      }

      localStorage.setItem("barber_customer_id", customerId);
      setQueueSession(queueEntry.id, queueEntry.code);
      localStorage.setItem("barber_customer_phone", fullPhone);
      localStorage.setItem("barber_customer_name", name);

      webhookService.sendWebhook(
        "JOINED",
        queueEntry,
        nextPosition,
        nextPosition - 1,
        mainDuration,
        shopName,
        webhookUrl,
        trackingUrlBase,
      );

      toast.success("Entrou na fila com sucesso!");
      navigate("/queue");
    } catch (error: any) {
      console.error(error);
      toast.error(
        error?.message ||
          "Falha ao entrar na fila. Por favor, tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };

  const [estimatedTimeStr, setEstimatedTimeStr] = useState("Agora");

  useEffect(() => {
    let mounted = true;
    async function calc() {
      const eta = await calculateEstimatedServiceTimeDynamic(queueCount + 1);
      if (mounted) setEstimatedTimeStr(eta);
    }
    calc();
    const interval = setInterval(calc, 20000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [queueCount]);
  const isQueueFull =
    estimatedTimeStr !== "Agora" &&
    maxQueueTime &&
    estimatedTimeStr.split(" ")[0] > maxQueueTime;

  if (statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-neutral-950">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 text-center"
      >
        <div className="flex flex-col items-center space-y-2">
          <div
            className={`overflow-hidden transition-all duration-500 ${
              logoUrl
                ? "h-32 w-32 rounded-3xl"
                : "rounded-2xl bg-emerald-600 p-4 shadow-none"
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
              <Scissors className="h-10 w-10 text-white" />
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            {shopName}
          </h1>
          <p className="text-neutral-400 italic">
            A maneira mais inteligente de esperar pelo seu corte.
          </p>
        </div>

        {!isOpen ? (
          <div className="rounded-2xl bg-amber-900/20 p-6 text-amber-400 shadow-sm border border-amber-900/30">
            <p className="font-medium">A barbearia está fechada no momento.</p>
            <p className="mt-1 text-sm opacity-90">{message}</p>
          </div>
        ) : isQueueFull ? (
          <div className="rounded-2xl bg-amber-900/20 p-6 text-amber-400 shadow-sm border border-amber-900/30">
            <p className="font-medium">A fila está lotada no momento.</p>
            <p className="mt-1 text-sm opacity-90">
              O tempo estimado de atendimento ultrapassa nosso horário limite de{" "}
              {maxQueueTime}. Por favor, tente novamente outro dia.
            </p>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-6 text-left">
              <div className="pt-2">
                <label className="mb-2 block text-sm font-semibold text-neutral-300">
                  Quantas pessoas vão cortar?
                </label>
                <select
                  value={numberOfPeople}
                  onChange={(e) => setNumberOfPeople(Number(e.target.value))}
                  className="h-14 w-full appearance-none rounded-xl border border-neutral-800 bg-neutral-900 px-4 text-lg text-white shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30 outline-none"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "pessoa" : "pessoas"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-neutral-300">
                  Seu Nome
                </label>
                <div className="relative">
                  <User className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Digite seu nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-14 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-12 text-lg text-white shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30 outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <div className="relative w-24 shrink-0">
                <select
                  value={ddd}
                  onChange={(e) => {
                    setDdd(e.target.value);
                  }}
                  className="h-14 w-full appearance-none rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-lg text-white shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30 outline-none"
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

              <div className="relative flex-1">
                <Phone className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Número (ex: 999999999)"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 9) {
                      setPhone(val);
                    }
                  }}
                  className="h-14 w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-12 text-lg text-white shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30 outline-none disabled"
                  required
                />
                {phone && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhone("");
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-300"
                  >
                    <X className="h-7 w-7" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 rounded-full px-3 py-4 text-sm bg-yellow-900/30 text-yellow-400">
              <CircleAlert className="text-sm" /> Você ainda não está na fila.
              Veja a estimativa:
              <ArrowDown className="text-sm" />
            </div>

            <div className="space-y-6 text-left">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-neutral-900 p-4 text-center border border-neutral-800 shadow-sm">
                  <Users className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                  <p className="text-xs font-bold uppercase text-yellow-400">
                    Sua posição estimada
                  </p>
                  <p className="text-xl font-black text-white mt-2">
                    {queueCount + 1}º
                  </p>
                </div>
                <div className="rounded-xl bg-neutral-900 p-4 text-center border border-neutral-800 shadow-sm">
                  <Clock className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                  <p className="text-xs font-bold uppercase text-yellow-400">
                    Horário estimado
                  </p>
                  <p className="text-xl font-black text-white mt-2">
                    {estimatedTimeStr}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 group relative flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-none transition-all active:scale-[0.98] disabled:opacity-70 bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  Entrar na Fila
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="pt-8 text-xs text-neutral-400 uppercase tracking-widest">
          Powered by {shopName} Tech
        </div>
      </motion.div>

      {dialogStep !== null && servicesPerPerson[dialogStep] !== undefined && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDialogStep(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDialogStep(null);
          }}
          tabIndex={-1}
          autoFocus
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 border border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                {dialogStep + 1} de {numberOfPeople}
              </p>
              <button
                type="button"
                onClick={() => setDialogStep(null)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h3 className="mb-1 text-lg font-semibold text-white">
              Serviços para:{" "}
              <span className="text-emerald-400">
                {dialogStep === 0 ? name : `Convidado ${dialogStep}`}
              </span>
            </h3>
            <p className="mb-4 text-xs text-neutral-500">
              Selecione os serviços desejados
            </p>

            <div className="space-y-2 mb-4">
              {BARBER_SERVICES.map((svc) => {
                const selected = servicesPerPerson[dialogStep].includes(
                  svc.id as ServiceId,
                );
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() =>
                      toggleService(dialogStep, svc.id as ServiceId)
                    }
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all ${
                      selected
                        ? "border-emerald-500 bg-emerald-900/20 text-emerald-400"
                        : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                          selected
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-neutral-600"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="font-medium">{svc.label}</span>
                    </div>
                    <span className="text-sm text-neutral-400">
                      {svc.duration} min
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mb-4 flex items-center justify-between rounded-xl bg-neutral-800 px-4 py-2">
              <span className="text-sm text-neutral-400">Tempo total</span>
              <span className="font-bold text-white">
                {calculatePersonDuration(servicesPerPerson[dialogStep])} min
              </span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDialogStep(null)}
                className="flex-1 h-12 rounded-xl border border-neutral-700 text-neutral-300 font-medium transition-colors hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDialogNext}
                disabled={
                  loading ||
                  servicesPerPerson[dialogStep].length === 0
                }
                className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-medium transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : dialogStep < numberOfPeople - 1 ? (
                  "Próximo"
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
