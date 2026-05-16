import { AnimatePresence, motion } from "motion/react";
import { Trash2 } from "lucide-react";

interface RemoveConfirmModalProps {
  isOpen: boolean;
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export default function RemoveConfirmModal({
  isOpen,
  itemName,
  onConfirm,
  onCancel,
  isProcessing,
}: RemoveConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-sm rounded-3xl bg-neutral-900 p-8 shadow-2xl text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-900/30 text-red-500">
              <Trash2 className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-white">
              Remover {itemName}?
            </h2>
            <p className="mb-8 text-neutral-400">
              Esta ação não pode ser desfeita. O cliente será removido da lista
              de espera.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                className="h-12 flex-1 rounded-xl bg-neutral-800 font-bold text-neutral-400 hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                disabled={isProcessing}
                className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white shadow-none hover:bg-red-700 disabled:opacity-50"
              >
                Remover
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}