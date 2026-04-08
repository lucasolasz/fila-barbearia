import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { supabase } from "./lib/supabase";
import Home from "./pages/Home";
import Join from "./pages/Join";
import QueueStatus from "./pages/QueueStatus";
import InService from "./pages/InService";
import AdminDashboard from "./pages/AdminDashboard";
import AdminSettings from "./pages/AdminSettings";
import AdminHistory from "./pages/AdminHistory";
import { Toaster } from "react-hot-toast";
import { ShopSettingsProvider, useShopSettings } from "./hooks/useShopSettings";

// Componente para gerenciar a sessão global e redirecionamentos automáticos
function SessionManager({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queueId = localStorage.getItem("barber_queue_id");

  useEffect(() => {
    // Não redireciona se estiver nas páginas de admin
    if (location.pathname.startsWith("/admin")) return;

    async function checkSession() {
      if (!queueId) return;

      const { data, error } = await supabase
        .from("queue")
        .select("status")
        .eq("id", queueId)
        .single();

      // Se houver um erro, verifica se é apenas uma falha de rede temporária (ex: volta do background).
      // O Supabase retorna PGRST116 quando o registro não é encontrado de fato.
      if (error && error.code !== "PGRST116") {
        return;
      }

      if (error || !data) {
        // Se o registro não existir mais, limpa a sessão
        localStorage.removeItem("barber_queue_id");
        localStorage.removeItem("barber_queue_code");
        localStorage.removeItem("barber_customer_id");
        localStorage.removeItem("barber_customer_phone");
        return;
      }

      // Lógica de redirecionamento automático baseada no status
      if (data.status === "waiting") {
        if (location.pathname !== "/queue" && location.pathname !== "/join") {
          navigate("/queue");
        }
      } else if (data.status === "serving") {
        if (location.pathname !== "/in-service") {
          navigate("/in-service");
        }
      } else if (data.status === "completed" || data.status === "cancelled") {
        // Se o atendimento acabou, apenas limpa o storage
        // Não força o redirecionamento para '/' se o usuário já estiver tentando entrar novamente
        localStorage.removeItem("barber_queue_id");
        localStorage.removeItem("barber_queue_code");
        localStorage.removeItem("barber_customer_id");
        localStorage.removeItem("barber_customer_phone");

        if (
          location.pathname === "/queue" ||
          location.pathname === "/in-service"
        ) {
          navigate("/");
        }
      }
    }

    checkSession();
  }, [queueId, location.pathname, navigate]);

  return <>{children}</>;
}

function AppContent() {
  const { theme } = useShopSettings();

  return (
    <Router>
      <SessionManager>
        <div
          className={`min-h-screen font-sans transition-colors duration-300 ${
            theme === "dark"
              ? "bg-neutral-950 text-neutral-50"
              : "bg-neutral-50 text-neutral-900"
          }`}
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join" element={<Join />} />
            <Route path="/queue" element={<QueueStatus />} />
            <Route path="/in-service" element={<InService />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/history" element={<AdminHistory />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </SessionManager>
    </Router>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-center" />
      <ShopSettingsProvider>
        <AppContent />
      </ShopSettingsProvider>
    </>
  );
}
