import { AnimatePresence, motion } from "motion/react";
import AddCustomerForm from "./AddCustomerForm";

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
}: AddCustomerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-md rounded-3xl bg-neutral-900 p-8 shadow-2xl"
          >
            <h2 className="mb-6 text-2xl font-bold text-white">
              Adicionar Cliente
            </h2>
            <AddCustomerForm onClose={onClose} onSuccess={onSuccess} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}