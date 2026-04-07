import {
  endOfDay,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  History,
  Loader2,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface HistoryItem {
  id: string;
  code: string;
  status: "completed" | "cancelled";
  created_at: string;
  service_start: string | null;
  service_end: string | null;
  customer: {
    name: string;
    phone: string;
  };
}

export default function AdminHistory() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "cancelled"
  >("all");

  useEffect(() => {
    const auth = sessionStorage.getItem("barber_admin_auth");
    if (auth !== "true") {
      navigate("/admin");
      return;
    }
    fetchHistory();
  }, [navigate]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("queue")
        .select("*, customer:customer_id(*)")
        .in("status", ["completed", "cancelled"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao buscar histórico");
    } finally {
      setLoading(false);
    }
  }

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch =
        item.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer?.phone.includes(searchTerm);

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;

      let matchesDate = true;
      if (startDate || endDate) {
        const itemDate = parseISO(item.created_at);
        const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
        const end = endDate ? endOfDay(parseISO(endDate)) : new Date();
        matchesDate = isWithinInterval(itemDate, { start, end });
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [history, searchTerm, startDate, endDate, statusFilter]);

  const stats = useMemo(() => {
    const completed = filteredHistory.filter((i) => i.status === "completed");
    const cancelled = filteredHistory.filter((i) => i.status === "cancelled");

    let totalMinutes = 0;
    completed.forEach((item) => {
      if (item.service_start && item.service_end) {
        const start = new Date(item.service_start);
        const end = new Date(item.service_end);
        totalMinutes += Math.round((end.getTime() - start.getTime()) / 60000);
      }
    });

    const avgDuration =
      completed.length > 0 ? Math.round(totalMinutes / completed.length) : 0;

    return {
      total: filteredHistory.length,
      completed: completed.length,
      cancelled: cancelled.length,
      avgDuration,
    };
  }, [filteredHistory]);

  if (loading && history.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 dark:bg-neutral-950">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md dark:bg-neutral-900/80 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/admin")}
              className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 transition-colors dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-2">
              <History className="h-6 w-6 text-emerald-600" />
              <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                Histórico de Atendimentos
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
              <span className="text-[10px] font-bold uppercase text-neutral-400 dark:text-neutral-500">
                Total
              </span>
            </div>
            <p className="text-3xl font-black text-neutral-900 dark:text-white">
              {stats.total}
            </p>
            <p className="text-xs text-neutral-500 mt-1 dark:text-neutral-400">
              Registros encontrados
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase text-neutral-400 dark:text-neutral-500">
                Concluídos
              </span>
            </div>
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500">
              {stats.completed}
            </p>
            <p className="text-xs text-neutral-500 mt-1 dark:text-neutral-400">
              Cortes realizados
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-[10px] font-bold uppercase text-neutral-400 dark:text-neutral-500">
                Cancelados
              </span>
            </div>
            <p className="text-3xl font-black text-red-600 dark:text-red-500">
              {stats.cancelled}
            </p>
            <p className="text-xs text-neutral-500 mt-1 dark:text-neutral-400">
              Desistências/Saídas
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="text-[10px] font-bold uppercase text-neutral-400 dark:text-neutral-500">
                Média
              </span>
            </div>
            <p className="text-3xl font-black text-blue-600 dark:text-blue-500">
              {stats.avgDuration}m
            </p>
            <p className="text-xs text-neutral-500 mt-1 dark:text-neutral-400">
              Tempo por corte
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100 space-y-6 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 w-[85%] sm:w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 w-[85%] sm:w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:bg-neutral-900 dark:focus:border-emerald-500"
              >
                <option value="all">Todos os Status</option>
                <option value="completed">Concluídos</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
                    Data/Hora
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
                    Cliente
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
                    Código
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
                    Duração
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredHistory.map((item) => {
                  let duration = "-";
                  if (item.service_start && item.service_end) {
                    const start = new Date(item.service_start);
                    const end = new Date(item.service_end);
                    duration = `${Math.round((end.getTime() - start.getTime()) / 60000)} min`;
                  }

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50 transition-colors dark:hover:bg-neutral-800/50"
                    >
                      <td className="px-6 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {format(parseISO(item.created_at), "dd/MM/yy HH:mm", {
                          locale: ptBR,
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-neutral-900 dark:text-white">
                          {item.customer?.name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-500">
                          {item.customer?.phone}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-black text-neutral-900 dark:bg-neutral-800 dark:text-white">
                          {item.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {duration}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            item.status === "completed"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {item.status === "completed"
                            ? "Concluído"
                            : "Cancelado"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-600">
              <Search className="mb-4 h-12 w-12 opacity-20" />
              <p className="font-medium">Nenhum registro encontrado</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
