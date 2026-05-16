import { Check, GripVertical, MessageCircle, Play, Trash2 } from "lucide-react";
import { forwardRef } from "react";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { QueueItem } from "../../lib/supabase";

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
            <h3 className="font-bold text-white">{item.customer?.name}</h3>
            {item.customer?.phone &&
              !item.customer.phone.startsWith("manual_") && (
                <p className="text-xs text-neutral-500">
                  {item.customer.phone}
                </p>
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