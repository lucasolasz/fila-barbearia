import {
  ArrowRight,
  Clock,
  Loader2,
  Phone,
  Scissors,
  User,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  useQueueCount,
  useShopStatus,
  calculateEstimatedServiceTime,
} from "../hooks/useQueue";
import { supabase } from "../lib/supabase";

import { DDD_OPTIONS } from "../constants/constants";
import { useShopSettings } from "../hooks/useShopSettings";
import { webhookService } from "../services/webhookService";

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
  const [loading, setLoading] = useState(false);
  const { isOpen, message, loading: statusLoading } = useShopStatus();
  const queueCount = useQueueCount();
  const navigate = useNavigate();
  const { shopName, logoUrl, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 8) {
      toast.error("Por favor, insira um número de telefone válido");
      return;
    }
    if (!name.trim()) {
      toast.error("Por favor, insira seu nome");
      return;
    }

    setLoading(true);
    const fullPhone = `${ddd}${phone}`;

    try {
      let customerId;
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

        const { data: queueEntry } = await supabase
          .from("queue")
          .select("*")
          .eq("customer_id", customerId)
          .in("status", ["waiting", "serving"])
          .maybeSingle();

        if (queueEntry) {
          toast.success("Você já está na fila!");
          localStorage.setItem("barber_customer_id", customerId);
          localStorage.setItem("barber_queue_id", queueEntry.id);
          localStorage.setItem("barber_queue_code", queueEntry.code);
          localStorage.setItem("barber_customer_phone", fullPhone);
          localStorage.setItem("barber_customer_name", name);
          navigate("/queue");
          return;
        }

        const { error: updateError } = await supabase
          .from("customers")
          .update({ name })
          .eq("id", customerId);
        if (updateError) throw updateError;
      } else {
        const { data: newCustomer, error: createError } = await supabase
          .from("customers")
          .insert([{ name, phone: fullPhone }])
          .select()
          .single();
        if (createError) throw createError;
        customerId = newCustomer.id;
      }

      if (!customerId)
        throw new Error("Não foi possível identificar o cliente.");

      const { data: lastEntry, error: lastEntryError } = await supabase
        .from("queue")
        .select("position, code")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEntryError) throw lastEntryError;

      const nextPosition = (lastEntry?.position || 0) + 1;

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
            position: nextPosition,
            status: "waiting",
          },
        ])
        .select("*, customer:customer_id(*)")
        .single();

      if (queueError) throw queueError;
      if (!queueEntry) throw new Error("Falha ao confirmar entrada na fila.");

      localStorage.setItem("barber_customer_id", customerId);
      localStorage.setItem("barber_queue_id", queueEntry.id);
      localStorage.setItem("barber_queue_code", queueEntry.code);
      localStorage.setItem("barber_customer_phone", fullPhone);
      localStorage.setItem("barber_customer_name", name);

      webhookService.sendWebhook(
        "JOINED",
        queueEntry,
        nextPosition,
        queueCount,
        baseQueueTime == null ? 30 : baseQueueTime,
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

  if (statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-neutral-50 dark:bg-neutral-950">
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
                : "rounded-2xl bg-emerald-600 p-4 shadow-lg shadow-emerald-200 dark:shadow-none"
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
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {shopName}
          </h1>
          <p className="text-neutral-500 italic dark:text-neutral-400">
            A maneira mais inteligente de esperar pelo seu corte.
          </p>
        </div>

        {!isOpen ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400">
            <p className="font-medium">A barbearia está fechada no momento.</p>
            <p className="mt-1 text-sm opacity-90">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleJoinSubmit} className="space-y-4">
            <div className="space-y-6 text-left">
              <div className="pt-2">
                <label className="mb-2 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Seu Nome
                </label>
                <div className="relative">
                  <User className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Digite seu nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-14 w-full rounded-xl border border-neutral-200 bg-white px-12 text-lg shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none dark:bg-neutral-900 dark:border-neutral-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
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
                  className="h-14 w-full appearance-none rounded-2xl border border-neutral-200 bg-white px-4 text-lg shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none dark:bg-neutral-900 dark:border-neutral-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
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
                  className="h-14 w-full rounded-2xl border border-neutral-200 bg-white px-12 text-lg shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none dark:bg-neutral-900 dark:border-neutral-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30 disabled"
                  required
                />
                {phone && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhone("");
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <X className="h-7 w-7" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6 text-left">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-4 text-center border border-neutral-200 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
                  <Users className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                  <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-500">
                    Sua posição estimada
                  </p>
                  <p className="text-xl font-black text-neutral-900 dark:text-white mt-2">
                    {queueCount + 1}º
                  </p>
                </div>
                <div className="rounded-xl bg-white p-4 text-center border border-neutral-200 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
                  <Clock className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                  <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-500">
                    Horário estimado
                  </p>
                  <p className="text-xl font-black text-neutral-900 dark:text-white mt-2">
                    {calculateEstimatedServiceTime(queueCount + 1)}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 group relative flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-none"
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
    </div>
  );
}
