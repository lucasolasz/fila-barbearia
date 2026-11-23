import {
  Clock,
  History,
  LogOut,
  Megaphone,
  MoreVertical,
  Power,
  Scissors,
  Settings,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AdminHeaderProps {
  shopName: string;
  logoUrl?: string;
  manualStatus: "auto" | "open" | "closed";
  onToggleManualStatus: () => void;
  isLunchPaused: boolean;
  onToggleLunch: () => void;
  isPreOpening: boolean;
  onTogglePreOpening: () => void;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export default function AdminHeader({
  shopName,
  logoUrl,
  manualStatus,
  onToggleManualStatus,
  isLunchPaused,
  onToggleLunch,
  isPreOpening,
  onTogglePreOpening,
  onNavigate,
  onLogout,
}: AdminHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navItems = [
    { label: "Campanhas", icon: Megaphone, path: "/admin/campaigns" },
    { label: "Histórico", icon: History, path: "/admin/history" },
    { label: "Clientes", icon: Users, path: "/admin/clients" },
    { label: "Configurações", icon: Settings, path: "/admin/settings" },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between p-4">
        <div className="flex items-center space-x-2">
          <div
            className={`overflow-hidden transition-all ${
              logoUrl ? "h-8 w-8 rounded-lg" : "rounded-lg bg-emerald-600 p-1.5"
            }`}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shopName}
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Scissors className="h-5 w-5 text-white" />
            )}
          </div>
          <h1 className="text-xl font-bold text-white">Painel Admin</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleManualStatus}
            className={`flex items-center sm:space-x-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
              manualStatus === "auto"
                ? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                : manualStatus === "open"
                  ? "bg-emerald-900/30 text-emerald-400"
                  : "bg-red-900/30 text-red-400"
            }`}
            title={
              manualStatus === "auto"
                ? "Seguindo Horário"
                : manualStatus === "open"
                  ? "Forçado Aberto"
                  : "Forçado Fechado"
            }
          >
            <Power className="h-4 w-4" />
            <span className="hidden sm:inline">
              {manualStatus === "auto"
                ? "Automático"
                : manualStatus === "open"
                  ? "Aberto"
                  : "Fechado"}
            </span>
          </button>
          <button
            onClick={onToggleLunch}
            className={`flex items-center sm:space-x-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
              isLunchPaused
                ? "bg-amber-900/30 text-amber-400"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
            title={
              isLunchPaused ? "Sair do Almoço" : "Ativar Pausa para Almoço"
            }
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isLunchPaused ? "Em Almoço" : "Almoço"}
            </span>
          </button>
          <button
            onClick={onTogglePreOpening}
            className={`flex items-center sm:space-x-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
              isPreOpening
                ? "bg-blue-900/30 text-blue-400"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
            title={
              isPreOpening ? "Encerrar Pré-Abertura" : "Ativar Pré-Abertura"
            }
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isPreOpening ? "Pré-Aberto" : "Pré-Abertura"}
            </span>
          </button>
          {/* Desktop: ícones inline */}
          <div className="hidden sm:flex items-center space-x-2">
            {navItems.map(({ label, icon: Icon, path }) => (
              <button
                key={path}
                onClick={() => onNavigate(path)}
                className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 transition-colors"
                title={label}
              >
                <Icon className="h-6 w-6" />
              </button>
            ))}
            <button
              onClick={onLogout}
              className="rounded-xl p-2 text-red-400 hover:bg-red-900/20 transition-colors"
              title="Sair"
            >
              <LogOut className="h-6 w-6" />
            </button>
          </div>

          {/* Mobile: dropdown */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 transition-colors"
              title="Mais opções"
            >
              <MoreVertical className="h-6 w-6" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-lg z-20">
                {navItems.map(({ label, icon: Icon, path }) => (
                  <button
                    key={path}
                    onClick={() => {
                      onNavigate(path);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
                <div className="my-1 border-t border-neutral-800" />
                <button
                  onClick={() => {
                    onLogout();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
