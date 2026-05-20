import { Check, GripVertical, MessageCircle, Play, Trash2 } from "lucide-react";
import { forwardRef } from "react";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { QueueItem } from "../../lib/supabase";
import { BARBER_SERVICES } from "../../constants/constants";

interface QueueItemCardProps {
  item: QueueItem;
  position: number;
  estimatedTime: string;
  servingCount: number;
  isDragging: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onStartService: (item: QueueItem) => void;
  onCompleteService: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  isProcessing: boolean;
}

const QueueItemCard = forwardRef<HTMLDivElement, QueueItemCardProps>(
  (
    {
      item,
      position,
      estimatedTime,
      servingCount,
      isDragging,
      dragHandleProps,
      onStartService,
      onCompleteService,
      onRemove,
      isProcessing,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={`group relative flex items-center justify-between rounded-2xl border p-4 transition-all ${
          item.status === "serving"
            ? "bg-emerald-900/20 border-emerald-500/50 ring-2 ring-emerald-500/50"
            : isDragging
              ? "bg-emerald-900/30 border-emerald-500 shadow-xl scale-[1.02] z-50"
              : "bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:shadow-md"
        }`}
      >
        <div className="flex items-center space-x-4">
          {item.status === "waiting" && dragHandleProps && (
            <div
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-2 text-neutral-700 hover:text-neutral-500 transition-colors"
            >
              <GripVertical className="h-5 w-5" />
            </div>
          )}
          <div
            className={`flex h-12 w-auto p-2 shrink-0 items-center justify-center rounded-xl font-black ${
              item.status === "serving"
                ? "bg-emerald-600 text-white"
                : "bg-neutral-800 text-white"
            }`}
          >
            {item.code}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white">{item.customer?.name}</h3>
              {item.parent_queue_id && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-300 ring-1 ring-fuchsia-500/60 bg-fuchsia-950/60 shadow-[0_0_6px_rgba(217,70,239,0.5)]">
                  convidado
                </span>
              )}
              {item.is_manual && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-500/60 bg-amber-950/60 shadow-[0_0_6px_rgba(245,158,11,0.5)]">
                  manual
                </span>
              )}
            </div>
            {item.customer?.phone &&
              !item.customer.phone.startsWith("manual_") && (
                <p className="text-xs text-neutral-500">
                  {item.customer.phone}
                </p>
              )}
            {item.selected_services && item.selected_services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.selected_services.map((svcId) => {
                  const svc = BARBER_SERVICES.find((s) => s.id === svcId);
                  const colorMap: Record<string, string> = {
                    cabelo:      "bg-sky-900/60 text-sky-300 ring-sky-700/60",
                    barba:       "bg-emerald-900/60 text-emerald-300 ring-emerald-700/60",
                    pezinho:     "bg-amber-900/60 text-amber-300 ring-amber-700/60",
                    sobrancelha: "bg-violet-900/60 text-violet-300 ring-violet-700/60",
                  };
                  const color = colorMap[svcId] ?? "bg-neutral-800 text-neutral-300 ring-neutral-700";
                  return svc ? (
                    <span
                      key={svcId}
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ${color}`}
                    >
                      {svc.label}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            <p className="text-xs text-neutral-600 mt-0.5">
              {new Date(item.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            {item.status === "serving" && item.service_start && (
              <p className="text-xs text-emerald-400 mt-0.5 font-semibold">
                Iniciou:{" "}
                {new Date(item.service_start).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            )}
            <p className="text-xs text-neutral-500 mt-0.5">
              Previsto: {estimatedTime}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {item.customer?.phone &&
            !item.customer.phone.startsWith("manual_") && (
              <a
                href={`https://wa.me/${item.customer.phone.replace(/\D/g, "").startsWith("55") ? item.customer.phone.replace(/\D/g, "") : "55" + item.customer.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/20 text-emerald-500 hover:bg-emerald-900/40 transition-all"
                title="Contactar via WhatsApp"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            )}
          {item.status === "serving" && (
            <button
              onClick={() => onCompleteService(item)}
              disabled={isProcessing}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50"
              title="Finalizar Atendimento"
            >
              <Check className="h-6 w-6" />
            </button>
          )}
          {item.status === "waiting" && (
            <button
              onClick={() => onStartService(item)}
              disabled={isProcessing}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50"
              title="Iniciar Atendimento"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            disabled={isProcessing}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-900/20 text-red-500 hover:bg-red-900/40 transition-all disabled:opacity-50"
            title="Remover"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  },
);

QueueItemCard.displayName = "QueueItemCard";

export default QueueItemCard;