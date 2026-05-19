import { AnimatePresence, motion } from "motion/react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from "@hello-pangea/dnd";
import { Loader2, Save, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { QueueItem } from "../../lib/supabase";
import { calculateEstimatedServiceTime } from "../../hooks/useQueue";
import QueueItemCard from "./QueueItemCard";

interface QueueListProps {
  queue: QueueItem[];
  localQueue: QueueItem[];
  isReordering: boolean;
  processingId: string | null;
  onDragEnd: (result: DropResult) => void;
  onSaveOrder: () => void;
  onCancelReorder: () => void;
  onStartService: (item: QueueItem) => void;
  onCompleteService: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onAddCustomer: () => void;
  loading?: boolean;
}

export default function QueueList({
  queue,
  localQueue,
  isReordering,
  processingId,
  onDragEnd,
  onSaveOrder,
  onCancelReorder,
  onStartService,
  onCompleteService,
  onRemove,
  onAddCustomer,
  loading = false,
}: QueueListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Fila ao Vivo</h2>
        <div className="flex space-x-2">
          <AnimatePresence>
            {isReordering && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex space-x-2"
              >
                <button
                  onClick={onCancelReorder}
                  className="flex items-center rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-400 hover:bg-neutral-700 transition-all"
                >
                  <X className="mr-1 h-4 w-4" />
                  Cancelar
                </button>
                <button
                  onClick={onSaveOrder}
                  className="flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-none hover:bg-emerald-700 transition-all"
                >
                  <Save className="mr-1 h-4 w-4" />
                  Salvar Ordem
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={onAddCustomer}
            className="flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-none hover:bg-emerald-700 transition-all"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Adicionar Cliente
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="queue-list">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-3"
              >
                {localQueue.map((item, index) => {
                  const servingCount = localQueue.filter(
                    (i) => i.status === "serving",
                  ).length;
                  const waitingItems = localQueue.filter(
                    (i) => i.status === "waiting",
                  );
                  const waitingIndex = waitingItems.findIndex(
                    (i) => i.id === item.id,
                  );
                  const position =
                    item.status === "serving"
                      ? 1
                      : servingCount + waitingIndex + 1;
                  const avgDuration =
                    localQueue.reduce(
                      (sum, i) => sum + (i.service_duration ?? 37),
                      0,
                    ) / (localQueue.length || 1);
                  const estimatedTime = calculateEstimatedServiceTime(
                    position,
                    Math.round(avgDuration),
                  );

                  return (
                    <Draggable
                      key={item.id}
                      draggableId={item.id}
                      index={index}
                      isDragDisabled={item.status === "serving"}
                    >
                      {(provided, snapshot) => (
                        <QueueItemCard
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          item={item}
                          position={position}
                          estimatedTime={estimatedTime}
                          servingCount={servingCount}
                          isDragging={snapshot.isDragging}
                          dragHandleProps={provided.dragHandleProps}
                          onStartService={onStartService}
                          onCompleteService={onCompleteService}
                          onRemove={onRemove}
                          isProcessing={!!processingId}
                        />
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {localQueue.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-600">
            <Users className="mb-4 h-12 w-12 opacity-20" />
            <p className="font-medium">A fila está vazia</p>
          </div>
        )}
      </div>
    </div>
  );
}