import { Scissors } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { motion } from "motion/react";

interface LoginScreenProps {
  shopName: string;
  logoUrl?: string;
  onLogin: () => void;
}

export default function LoginScreen({ shopName, logoUrl, onLogin }: LoginScreenProps) {
  const [pin, setPin] = useState("");
  const adminPin = import.meta.env.VITE_ADMIN_PIN || "1234";

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === adminPin) {
      sessionStorage.setItem("barber_admin_auth", "true");
      onLogin();
    } else {
      toast.error("PIN Inválido");
      setPin("");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm space-y-8 rounded-3xl bg-neutral-900 p-8 shadow-2xl"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-emerald-600 overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shopName}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Scissors className="h-10 w-10 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{shopName} Admin</h1>
          <p className="text-neutral-400">
            Digite seu PIN de 4 dígitos para acessar
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <input
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="h-16 w-full rounded-2xl border-2 border-neutral-700 bg-neutral-800 text-center text-3xl font-bold text-white tracking-[1em] outline-none transition-all focus:bg-neutral-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-900/30"
            autoFocus
          />
          <button
            type="submit"
            className="h-14 w-full rounded-2xl bg-emerald-600 font-bold text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-95"
          >
            Desbloquear Painel
          </button>
        </form>
      </motion.div>
    </div>
  );
}