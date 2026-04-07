import {
  AlertTriangle,
  Clock,
  Loader2,
  LogOut,
  MessageCircle,
  Scissors,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAverageServiceTime } from "../hooks/useQueue";
import { QueueItem, supabase } from "../lib/supabase";

import { useShopSettings } from "../hooks/useShopSettings";

export default function QueueStatus() {
  const navigate = useNavigate();
  const [queueItem, setQueueItem] = useState<QueueItem | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const avgServiceTime = useAverageServiceTime();
  const { shopName, logoUrl } = useShopSettings();

  const queueId = localStorage.getItem("barber_queue_id");

  useEffect(() => {
    if (!queueId) {
      navigate("/");
      return;
    }

    async function fetchStatus() {
      const { data, error } = await supabase
        .from("queue")
        .select("*, customer:customer_id(*)")
        .eq("id", queueId)
        .single();

      if (error || !data) {
        console.error("Error fetching queue status:", error);
        toast.error("Não foi possível encontrar seu lugar na fila.");
        localStorage.removeItem("barber_queue_id");
        navigate("/");
        return;
      }

      if (data.status === "completed" || data.status === "cancelled") {
        toast.success(
          data.status === "completed"
            ? "Seu atendimento foi finalizado!"
            : "Você saiu da fila.",
        );
        localStorage.removeItem("barber_queue_id");
        localStorage.removeItem("barber_queue_code");
        localStorage.removeItem("barber_customer_id");
        localStorage.removeItem("barber_customer_phone");
        navigate("/");
        return;
      }

      if (data.status === "serving") {
        navigate("/in-service");
        return;
      }

      setQueueItem(data);
      calculatePosition(data.position);
      fetchSettings();
      setLoading(false);
    }

    async function fetchSettings() {
      const { data } = await supabase
        .from("shop_settings")
        .select("whatsapp_number")
        .limit(1)
        .maybeSingle();
      if (data?.whatsapp_number) {
        setWhatsappNumber(data.whatsapp_number);
      }
    }

    async function calculatePosition(currentPosition: number) {
      const { count } = await supabase
        .from("queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting")
        .lt("position", currentPosition || 999999);

      // Position is count + 1 if we are waiting
      setPosition((count || 0) + 1);
    }

    fetchStatus();

    // Real-time subscription
    const channel = supabase
      .channel("queue_updates")
      .on("postgres_changes" as any, { event: "*", table: "queue" }, () => {
        fetchStatus();
      })
      .subscribe();

    // Polling fallback
    const pollInterval = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [queueId, navigate]);

  const handleLeave = async () => {
    try {
      await supabase
        .from("queue")
        .update({ status: "cancelled" })
        .eq("id", queueId);

      localStorage.removeItem("barber_queue_id");
      localStorage.removeItem("barber_queue_code");
      localStorage.removeItem("barber_customer_id");
      localStorage.removeItem("barber_customer_phone");
      navigate("/");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao sair da fila.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-neutral-500 animate-pulse font-medium dark:text-neutral-400">
          Atualizando seu status...
        </p>
      </div>
    );
  }

  const waitTime = position ? (position - 1) * avgServiceTime : 0;
  const hours = Math.floor(waitTime / 60);
  const mins = waitTime % 60;
  const waitTimeStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 bg-neutral-50 dark:bg-neutral-950">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="relative p-1 overflow-hidden rounded-[2.25rem] shadow-2xl shadow-emerald-500/10">
          {/* Border Beam Animation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0 340deg, #10b981 360deg)",
            }}
            className="absolute inset-[-200%] z-0"
          />

          <div className="relative z-10 overflow-hidden rounded-[2rem] bg-white dark:bg-neutral-900">
            <div className="bg-neutral-900 p-4 text-center text-white relative dark:bg-black">
              <div className="absolute top-4 right-4 flex items-center space-x-2">
                <motion.div
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="h-[5px] w-[5px] rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                />
                <span className="text-[9px] font-bold uppercase tracking-widest text-red-500">
                  Ao Vivo
                </span>
              </div>
              <p className="text-sm font-medium uppercase tracking-widest opacity-60">
                Seu Código na Fila
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tighter">
                {queueItem?.code}
              </h2>
            </div>
            {}
            <div className="p-8 space-y-5">
              <div
                className={`grid ${waitTime > 0 ? "grid-cols-2" : "grid-cols-1"} gap-4`}
              >
                <div className="rounded-2xl bg-neutral-50 p-2 text-center border border-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">
                  <Users className="mx-auto mb-2 h-6 w-6 text-emerald-600 dark:text-emerald-500" />
                  <p className="text-xs font-semibold uppercase text-neutral-400 dark:text-neutral-500">
                    Posição
                  </p>
                  <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {position}
                  </p>
                </div>
                {waitTime > 0 && (
                  <div className="rounded-2xl bg-neutral-50 p-4 text-center border border-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">
                    <Clock className="mx-auto mb-2 h-6 w-6 text-emerald-600 dark:text-emerald-500" />
                    <p className="text-xs font-semibold uppercase text-neutral-400 dark:text-neutral-500">
                      {waitTime > 0 ? "Tempo de Espera" : "A qualquer momento"}
                    </p>
                    <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {waitTimeStr}
                    </p>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {position !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-start space-x-3 rounded-2xl bg-amber-50 p-4 text-amber-800 border border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400"
                  >
                    <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-500" />
                    <div>
                      <p className="font-bold text-amber-50">
                        {position <= 1 && "Você é o proximo!"}
                        {position == 2 && "Sua vez está se aproximando!"}
                      </p>
                      <p className="text-sm opacity-90">
                        {position <= 1 &&
                          "Aguarde, o barbeiro irá chamá-lo em instantes."}
                        {position == 2 &&
                          "Para não perder sua vez, já venha para a barbearia."}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-4 pt-4">
                {whatsappNumber && (
                  <a
                    href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center rounded-2xl bg-emerald-500 p-4 font-bold text-white shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-600 active:scale-95 dark:shadow-none"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Dúvidas? Chame no WhatsApp
                  </a>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Status
                  </span>

                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize
                                ${
                                  waitTime === 0
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                }`}
                  >
                    {queueItem?.status === "waiting"
                      ? waitTime === 0
                        ? "Chamado em breve"
                        : "Aguardando"
                      : queueItem?.status === "serving"
                        ? "Em atendimento"
                        : queueItem?.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Cliente
                  </span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {queueItem?.customer?.name}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-2">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="rounded-2xl w-full p-4 flex items-center justify-center text-sm  bg-red-700 font-medium hover:text-red-700 transition-colors dark:text-white dark:hover:text-red-400"
          >
            <LogOut className="mr-1 h-4 w-4" />
            Sair da Fila
          </button>
        </div>

        <div className="rounded-2xl mx-2 bg-white p-6 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
          <h3 className="mb-4 font-bold text-neutral-900 dark:text-white">
            Dicas da Fila
          </h3>
          <ul className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
            <li className="flex items-start">
              <div className="mr-3 mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              Mantenha esta página aberta para ver atualizações em tempo real.
            </li>
            <li className="flex items-start">
              <div className="mr-3 mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              Nós notificaremos você aqui quando for o próximo da fila.
            </li>
          </ul>
        </div>
      </motion.div>

      {/* Leave Confirmation Modal */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-center dark:bg-neutral-900 dark:border dark:border-neutral-800"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-500">
                <LogOut className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-neutral-900 dark:text-white">
                Sair da Fila?
              </h2>
              <p className="mb-8 text-neutral-500 dark:text-neutral-400">
                Você perderá sua posição atual e precisará entrar novamente se
                mudar de ideia.
              </p>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="h-12 flex-1 rounded-xl bg-neutral-100 font-bold text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                >
                  Continuar na Fila
                </button>
                <button
                  onClick={handleLeave}
                  className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white shadow-lg shadow-red-100 hover:bg-red-700 dark:shadow-none"
                >
                  Sair Agora
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
