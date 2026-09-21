import {
  ArrowDown,
  ArrowRight,
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
import React, { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useQueueCount, useShopStatus } from "../hooks/useQueue";
import { useQueueCutoff } from "../hooks/useQueueCutoff";
import {
  DEFAULT_SERVICE_MINUTES,
  formatQueueTail,
  timeToMinutes,
} from "../lib/schedule";
import { sanitizeNameInput } from "../lib/nameUtils";
import { supabase } from "../lib/supabase";

import {
  DDD_OPTIONS,
  DEFAULT_SERVICE_ID,
  ServiceId,
} from "../constants/constants";
import { useBarberServices } from "../hooks/useBarberServices";
import { useShopSettings } from "../hooks/useShopSettings";
import { webhookService } from "../services/webhookService";
import ServiceSelectionDialog, {
  calculatePersonDuration,
} from "../components/ServiceSelectionDialog";
import {
  getQueueId,
  getQueueCode,
  setQueueSession,
  clearQueueSession,
} from "../lib/storage";

/** Teto de pessoas por entrada na fila. */
const MAX_PEOPLE = 5;

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
  const {
    isOpen,
    message,
    closeTime,
    openTime,
    preOpeningMinutes,
    loading: statusLoading,
  } = useShopStatus();
  const queueCount = useQueueCount();
  const navigate = useNavigate();
  const { activeServices, loading: servicesLoading } = useBarberServices();
  const {
    shopName,
    logoUrl,
    webhookUrl,
    trackingUrlBase,
    baseQueueTime,
    isLunchPaused,
    isPreOpening,
    loading: settingsLoading,
  } = useShopSettings();

  // Decisao de produto: durante o almoco e a pre-abertura o corte fica desligado.
  const cutoffEnabled = !isLunchPaused && !isPreOpening;
  const {
    queueTailAt,
    loading: cutoffLoading,
    refresh: refreshCutoff,
    canFit,
    peopleThatFit,
  } = useQueueCutoff(closeTime, cutoffEnabled);

  /**
   * Duracao de quem entra na fila sem mexer em nada.
   * E a referencia do corte: usar o servico mais curto do catalogo faria a tela
   * liberar o formulario para alguem que seria recusado no submit.
   */
  const defaultServiceMinutes = useMemo(
    () =>
      calculatePersonDuration([DEFAULT_SERVICE_ID], activeServices) ||
      DEFAULT_SERVICE_MINUTES,
    [activeServices],
  );

  /** Quantas pessoas ainda cabem hoje com o servico padrao. */
  const availablePeople = peopleThatFit(defaultServiceMinutes, MAX_PEOPLE);

  const peopleOptions = useMemo(
    // availablePeople so e 0 quando `isQueueFull` ja esconde o formulario.
    () => Array.from({ length: Math.max(1, availablePeople) }, (_, i) => i + 1),
    [availablePeople],
  );

  // A fila pode crescer com o formulario aberto: nunca deixar a selecao acima do limite.
  useEffect(() => {
    setNumberOfPeople((current) => Math.min(current, peopleOptions.length));
  }, [peopleOptions.length]);

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
      .then(({ data, error }: { data: { id: string; status: string } | null; error: { code: string } | null }) => {
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
    if (!canFit(numberOfPeople * defaultServiceMinutes)) {
      toast.error(
        `A fila encheu. Agora só dá tempo para ${availablePeople} ${
          availablePeople === 1 ? "pessoa" : "pessoas"
        } antes do fechamento (${closeTime?.slice(0, 5)}).`,
      );
      return;
    }
    const initial: ServiceId[][] = Array.from({ length: numberOfPeople }, () => [
      DEFAULT_SERVICE_ID,
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
      const totalDuration = servicesPerPerson.reduce(
        (total, services) =>
          total +
          (calculatePersonDuration(services, activeServices) ||
            DEFAULT_SERVICE_MINUTES),
        0,
      );

      // A fila pode ter enchido enquanto o cliente escolhia os servicos.
      const freshTail = await refreshCutoff();
      if (!canFit(totalDuration, freshTail)) {
        toast.error(
          `Os serviços escolhidos passariam do nosso horário de fechamento (${closeTime?.slice(0, 5)}). Reduza os serviços ou o número de pessoas.`,
        );
        return;
      }

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
        .in("status", ["waiting", "serving"])
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEntryError) throw lastEntryError;

      const nextPosition = (lastEntry?.position || 0) + 1;

      const mainServices = servicesPerPerson[0] ?? [DEFAULT_SERVICE_ID];
      const mainDuration =
        calculatePersonDuration(mainServices, activeServices) || 30;

      const { data: queueEntry, error: queueError } = await supabase
        .from("queue")
        .insert([
          {
            customer_id: customerId,
            code: generateCode(),
            position: nextPosition,
            status: "waiting",
            service_duration: mainDuration,
            selected_services: mainServices,
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

        const guestServices = servicesPerPerson[i] ?? [DEFAULT_SERVICE_ID];
        const guestDuration =
          calculatePersonDuration(guestServices, activeServices) ||
          DEFAULT_SERVICE_MINUTES;

        const { error: guestQueueErr } = await supabase.from("queue").insert([
          {
            customer_id: guestCustomer.id,
            code: generateCode(),
            position: nextPosition + i,
            status: "waiting",
            service_duration: guestDuration,
            selected_services: guestServices,
            parent_queue_id: queueEntry.id,
          },
        ]);
        if (guestQueueErr) throw guestQueueErr;
      }

      localStorage.setItem("barber_customer_id", customerId);
      setQueueSession(queueEntry.id, queueEntry.code);
      localStorage.setItem("barber_customer_phone", fullPhone);
      localStorage.setItem("barber_customer_name", name);

      webhookService
        .sendWebhook(
          isLunchPaused
            ? "JOINED_IN_LUNCH"
            : isPreOpening
              ? "JOINED_IN_PRE_OPENING"
              : "JOINED",
          queueEntry,
          queueCount + 1,
          queueCount,
          mainDuration,
          shopName,
          webhookUrl,
          trackingUrlBase,
        )
        .then((sent) => {
          if (!sent) console.error(`Webhook JOINED falhou para ${queueEntry.id}`);
        });

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

  const estimatedTimeStr = cutoffEnabled ? formatQueueTail(queueTailAt) : "";
  const isQueueFull = !canFit(defaultServiceMinutes);

  const preQueueInfo = (() => {
    if (!openTime || !preOpeningMinutes) return null;
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const preQueueMinutes = timeToMinutes(openTime) - preOpeningMinutes;
    const diffMinutes = preQueueMinutes - nowMinutes;
    if (diffMinutes <= 0) return null;

    const h = Math.floor(preQueueMinutes / 60) % 24;
    const m = preQueueMinutes % 60;
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const diffH = Math.floor(diffMinutes / 60);
    const diffM = diffMinutes % 60;
    const durationStr =
      diffH > 0 && diffM > 0
        ? `${diffH}h${diffM}min`
        : diffH > 0
          ? `${diffH}h`
          : `${diffM}min`;

    return { timeStr, durationStr };
  })();

  if (statusLoading || settingsLoading || cutoffLoading || servicesLoading) {
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

        {!isOpen && !isPreOpening ? (
          <div className="rounded-2xl bg-amber-900/20 p-6 text-amber-400 shadow-sm border border-amber-900/30">
            <p className="font-medium">A barbearia está fechada no momento.</p>
            <p className="mt-1 text-sm opacity-90">{message}</p>
            {preQueueInfo && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-amber-900/40 bg-amber-900/30 px-4 py-2.5 text-sm">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Pré-fila disponível em{" "}
                  <span className="font-semibold">{preQueueInfo.durationStr}</span>{" "}
                  <span className="opacity-75">(às {preQueueInfo.timeStr})</span>
                </span>
              </div>
            )}
          </div>
        ) : isQueueFull ? (
          <div className="rounded-2xl bg-amber-900/20 p-6 text-amber-400 shadow-sm border border-amber-900/30">
            <p className="font-medium">Não dá mais tempo hoje.</p>
            <p className="mt-1 text-sm opacity-90">
              A fila atual já ocupa todo o tempo até o nosso horário de
              fechamento ({closeTime?.slice(0, 5)}). Por favor, tente novamente
              outro dia.
            </p>
          </div>
        ) : (
          <>
            {isLunchPaused && (
              <div className="rounded-2xl bg-amber-900/20 p-4 text-amber-400 border border-amber-900/30">
                <p className="font-medium">Estamos em pausa para o almoço.</p>
                <p className="mt-1 text-sm opacity-90">
                  Você pode entrar na fila e será atendido ao retornarmos.
                </p>
              </div>
            )}
            {isPreOpening && (
              <div className="rounded-2xl bg-blue-900/20 p-4 text-blue-400 border border-blue-900/30">
                <p className="font-medium">Barbearia abrindo em breve.</p>
                <p className="mt-1 text-sm opacity-90">
                  Você já pode entrar na fila e quando o barbeiro chegar você
                  receberá seu horário de atendimento.
                </p>
              </div>
            )}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-6 text-left">
                <div className="pt-2">
                  <label className="mb-2 block text-sm font-semibold text-neutral-300">
                    Quantas pessoas vão cortar?
                  </label>
                  <div className="relative">
                    <select
                      value={numberOfPeople}
                      onChange={(e) =>
                        setNumberOfPeople(Number(e.target.value))
                      }
                      className="h-14 w-full appearance-none rounded-xl border border-neutral-800 bg-neutral-900 px-4 text-lg text-white shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30 outline-none"
                    >
                      {peopleOptions.map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "pessoa" : "pessoas"}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </div>
                  </div>
                  {cutoffEnabled && closeTime && availablePeople < MAX_PEOPLE && (
                    <p className="mt-2 text-sm text-amber-400">
                      Hoje ainda dá tempo para {availablePeople}{" "}
                      {availablePeople === 1 ? "pessoa" : "pessoas"} antes do
                      fechamento ({closeTime.slice(0, 5)}).
                    </p>
                  )}
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
                      onChange={(e) => setName(sanitizeNameInput(e.target.value))}
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
                <div
                  className={`grid ${isLunchPaused || isPreOpening ? "grid-cols-1" : "grid-cols-2"} gap-3`}
                >
                  <div className="rounded-xl bg-neutral-900 p-4 text-center border border-neutral-800 shadow-sm">
                    <Users className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                    <p className="text-xs font-bold uppercase text-yellow-400">
                      Sua posição estimada
                    </p>
                    <p className="text-xl font-black text-white mt-2">
                      {queueCount + 1}º
                    </p>
                  </div>
                  {!isLunchPaused && !isPreOpening && (
                    <div className="rounded-xl bg-neutral-900 p-4 text-center border border-neutral-800 shadow-sm">
                      <Clock className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                      <p className="text-xs font-bold uppercase text-yellow-400">
                        Horário estimado
                      </p>
                      <p className="text-xl font-black text-white mt-2">
                        {estimatedTimeStr}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`mt-4 group relative flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-none transition-all active:scale-[0.98] disabled:opacity-70 ${
                  isLunchPaused
                    ? "bg-amber-500 hover:bg-amber-600"
                    : isPreOpening
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                }`}
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
          </>
        )}

        <div className="pt-8 text-xs text-neutral-400 uppercase tracking-widest">
          Powered by {shopName} Tech
        </div>
      </motion.div>

      {dialogStep !== null && servicesPerPerson[dialogStep] !== undefined && (
        <ServiceSelectionDialog
          personName={dialogStep === 0 ? name : `Convidado ${dialogStep}`}
          personIndex={dialogStep}
          totalPeople={numberOfPeople}
          services={activeServices}
          selectedServices={servicesPerPerson[dialogStep]}
          loading={loading}
          onToggle={(id) => toggleService(dialogStep, id)}
          onDismiss={() => setDialogStep(null)}
          onBack={() =>
            dialogStep > 0
              ? setDialogStep(dialogStep - 1)
              : setDialogStep(null)
          }
          onNext={handleDialogNext}
        />
      )}
    </div>
  );
}
