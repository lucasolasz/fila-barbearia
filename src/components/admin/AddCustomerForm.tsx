import { Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { DDD_OPTIONS } from "../../constants/constants";
import { useQueueCount } from "../../hooks/useQueue";
import { useShopSettings } from "../../hooks/useShopSettings";
import { supabase } from "../../lib/supabase";
import { webhookService } from "../../services/webhookService";

interface AddCustomerFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCustomerForm({ onClose, onSuccess }: AddCustomerFormProps) {
  const [name, setName] = useState("");
  const [ddd, setDdd] = useState("21");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const queueCount = useQueueCount();
  const { shopName, webhookUrl, trackingUrlBase, baseQueueTime, isLunchPaused, isPreOpening } =
    useShopSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (phone && (phone.length !== 9 || !phone.startsWith("9"))) {
      toast.error(
        "Por favor, insira um número de celular válido (9 dígitos, iniciando com 9)",
      );
      return;
    }

    setLoading(true);
    try {
      let customerId;
      const hasPhone = phone && phone.trim() !== "";
      const fullPhone = hasPhone ? `${ddd}${phone}` : "";
      const cleanPhone = hasPhone
        ? fullPhone.replace(/\D/g, "")
        : `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      if (hasPhone && cleanPhone) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", cleanPhone)
          .maybeSingle();

        if (existing) {
          customerId = existing.id;
          await supabase
            .from("customers")
            .update({ name: name.trim() })
            .eq("id", customerId);
        }
      }

      if (!customerId) {
        const { data: created, error: createError } = await supabase
          .from("customers")
          .insert([{ name: name.trim(), phone: cleanPhone }])
          .select()
          .single();
        if (createError) throw createError;
        customerId = created.id;
      }

      const { data: last, error: lastError } = await supabase
        .from("queue")
        .select("position, code")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw lastError;

      const nextPos = (last?.position || 0) + 1;

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
            position: nextPos,
            status: "waiting",
          },
        ])
        .select("*, customer:customer_id(*)")
        .single();

      if (queueError) throw queueError;

      const peopleAhead = queueCount;
      const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;
      if (!cleanPhone.startsWith("manual_")) {
        webhookService.sendWebhook(
          isLunchPaused ? "JOINED_IN_LUNCH" : isPreOpening ? "JOINED_IN_PRE_OPENING" : "JOINED",
          queueEntry,
          queueCount + 1,
          peopleAhead,
          currentBaseTime,
          shopName,
          webhookUrl,
          trackingUrlBase,
        );
      }

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
        <label className="mb-1 block text-sm font-bold text-neutral-400">
          Nome
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:bg-neutral-900 focus:border-emerald-500"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-400">
          Telefone (Opcional)
        </label>
        <div className="flex space-x-2">
          <div className="relative w-24 shrink-0">
            <select
              value={ddd}
              onChange={(e) => setDdd(e.target.value)}
              className="h-12 w-full appearance-none rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:bg-neutral-900 focus:border-emerald-500"
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
          <input
            type="text"
            inputMode="numeric"
            value={phone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= 9) {
                setPhone(val);
              }
            }}
            placeholder="9XXXX-XXXX"
            className="h-12 flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:bg-neutral-900 focus:border-emerald-500"
          />
        </div>
      </div>
      <div className="flex space-x-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-xl bg-neutral-800 font-bold text-neutral-400 hover:bg-neutral-700"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-12 flex-1 rounded-xl bg-emerald-600 font-bold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50"
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