import { QueueItem } from "../../lib/supabase";

interface StatsCardsProps {
  queue: QueueItem[];
}

export default function StatsCards({ queue }: StatsCardsProps) {
  const servingItem = queue.find((i) => i.status === "serving");

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-2xl bg-neutral-900 p-4 shadow-sm border border-neutral-800">
        <p className="text-xs font-bold uppercase text-neutral-500">
          Na Fila
        </p>
        <p className="text-2xl font-black text-white">{queue.length}</p>
      </div>

      <div className="rounded-2xl bg-emerald-600 p-4 text-white shadow-none">
        <p className="text-xs font-bold uppercase opacity-70">
          Atendendo Agora
        </p>
        <p className="text-xl font-bold truncate">
          {servingItem?.customer?.name || "Ninguém no momento"}
        </p>
      </div>
    </div>
  );
}