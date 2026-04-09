import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  User,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useQueueCount,
  calculateEstimatedServiceTime,
} from "../hooks/useQueue";
import { supabase } from "../lib/supabase";

import { useShopSettings } from "../hooks/useShopSettings";
import { webhookService } from "../services/webhookService";

export default function Join() {
  const location = useLocation();
  const navigate = useNavigate();
  const phone = (location.state?.phone || "").trim();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const queueCount = useQueueCount();
  const { shopName, logoUrl, webhookUrl, trackingUrlBase, baseQueueTime } =
    useShopSettings();

  useEffect(() => {
    if (!phone) {
      navigate("/");
      return;
    }

    async function checkCustomer() {
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("phone", phone.trim())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching customer:", error);
        } else if (data) {
          setName(data.name);
        }
      } catch (err) {
        console.error("Unexpected error checking customer:", err);
      } finally {
        setChecking(false);
      }
    }
    checkCustomer();
  }, [phone, navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Ensure customer exists
      let customerId;
      const { data: existingCustomer, error: fetchError } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching existing customer:", fetchError);
        throw fetchError;
      }

      if (existingCustomer) {
        customerId = existingCustomer.id;
        // Update name if changed
        const { error: updateError } = await supabase
          .from("customers")
          .update({ name })
          .eq("id", customerId);

        if (updateError) {
          console.error("Error updating customer name:", updateError);
          throw updateError;
        }
      } else {
        const { data: newCustomer, error: createError } = await supabase
          .from("customers")
          .insert([{ name, phone }])
          .select()
          .single();

        if (createError) {
          console.error("Error creating new customer:", createError);
          throw createError;
        }
        customerId = newCustomer.id;
      }

      if (!customerId) {
        throw new Error(
          "Não foi possível identificar o cliente. Por favor, tente novamente.",
        );
      }

      // 2. Get next position and code
      // We look for the highest position among ALL entries to ensure uniqueness
      const { data: lastEntry, error: lastEntryError } = await supabase
        .from("queue")
        .select("position, code")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEntryError) {
        console.error("Error fetching last queue entry:", lastEntryError);
        throw lastEntryError;
      }

      const nextPosition = (lastEntry?.position || 0) + 1;

      // Gerar código alfanumérico aleatório de 5 caracteres (garantindo pelo menos 1 número)
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const numbers = "0123456789";
      const allChars = letters + numbers;
      let nextCode = "";

      // Gerar os primeiros 4 caracteres aleatoriamente
      for (let i = 0; i < 4; i++) {
        nextCode += allChars.charAt(
          Math.floor(Math.random() * allChars.length),
        );
      }

      // Se ainda não houver número, o 5º DEVE ser um número.
      // Caso contrário, pode ser qualquer um.
      const hasNumber = /\d/.test(nextCode);
      if (!hasNumber) {
        nextCode += numbers.charAt(Math.floor(Math.random() * numbers.length));
      } else {
        nextCode += allChars.charAt(
          Math.floor(Math.random() * allChars.length),
        );
      }

      // Embaralhar levemente para o número não ficar sempre no final (opcional, mas melhora a estética)
      nextCode = nextCode
        .split("")
        .sort(() => Math.random() - 0.5)
        .join("");

      // 3. Join queue
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

      if (queueError) {
        console.error("Error joining queue:", queueError);
        throw queueError;
      }

      if (!queueEntry) {
        throw new Error(
          "Falha ao confirmar entrada na fila. Por favor, tente novamente.",
        );
      }

      localStorage.setItem("barber_customer_id", customerId);
      localStorage.setItem("barber_queue_id", queueEntry.id);
      localStorage.setItem("barber_queue_code", queueEntry.code);
      localStorage.setItem("barber_customer_phone", phone);
      localStorage.setItem("barber_customer_name", name);

      // Send webhooks
      const peopleAhead = queueCount; // queueCount is the number of people BEFORE this user joined
      webhookService.sendWebhook(
        "JOINED",
        queueEntry,
        nextPosition,
        peopleAhead,
        baseQueueTime == null ? 30 : baseQueueTime,
        shopName,
        webhookUrl,
        trackingUrlBase,
      );

      toast.success("Entrou na fila com sucesso!");
      navigate("/queue");
    } catch (error: any) {
      console.error("Full join error:", error);
      const errorMessage =
        error?.message ||
        "Falha ao entrar na fila. Por favor, tente novamente.";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-neutral-50 dark:bg-neutral-950">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md space-y-8"
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center text-neutral-500 hover:text-neutral-800 transition-colors dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </button>

        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Quase lá!
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">
            Confirme seus dados para entrar na fila.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 text-center border border-neutral-200 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
            <Users className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
            <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-500">
              Sua Posição
            </p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">
              {queueCount + 1}º
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center border border-neutral-200 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
            <Clock className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
            <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-500">
              Horário Estimado
            </p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">
              {calculateEstimatedServiceTime(queueCount + 1)}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleJoin}
          className="space-y-6 rounded-3xl bg-white p-8 shadow-xl shadow-neutral-200/50 dark:bg-neutral-900 dark:shadow-none dark:border dark:border-neutral-800"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Número de Telefone
              </label>
              <div className="rounded-xl bg-neutral-50 p-4 text-neutral-500 border border-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700">
                {phone}
              </div>
            </div>

            <div>
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
                  className="h-14 w-full rounded-xl border border-neutral-200 bg-white px-12 text-lg shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:ring-emerald-900/20"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-emerald-600 text-lg font-semibold text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-70 dark:shadow-none"
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                Entrar na Fila Agora
                <CheckCircle2 className="ml-2 h-5 w-5" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
