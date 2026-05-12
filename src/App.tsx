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
import AdminCampaigns from "./pages/AdminCampaigns";
import { Toaster } from "react-hot-toast";
import { ShopSettingsProvider } from "./hooks/useShopSettings";

// Componente para gerenciar a sessão global e redirecionamentos automáticos
function SessionManager({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;

    async function checkSession() {
      const queueId = localStorage.getItem("barber_queue_id");
      if (!queueId) return;

      const { data, error } = await supabase
        .from("queue")
        .select("status")
        .eq("id", queueId)
        .single();

      if (error && error.code !== "PGRST116") {
        return;
      }

      if (error || !data) {
        localStorage.removeItem("barber_queue_id");
        localStorage.removeItem("barber_queue_code");
        if (location.pathname !== "/") {
          navigate("/");
        }
        return;
      }

      if (data.status === "waiting") {
        if (location.pathname !== "/queue" && location.pathname !== "/join") {
          navigate("/queue");
        }
      } else if (data.status === "serving") {
        if (location.pathname !== "/in-service") {
          navigate("/in-service");
        }
      } else if (data.status === "completed" || data.status === "cancelled") {
        localStorage.removeItem("barber_queue_id");
        localStorage.removeItem("barber_queue_code");

        if (
          location.pathname === "/queue" ||
          location.pathname === "/in-service"
        ) {
          navigate("/");
        }
      }
    }

    checkSession();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname, navigate]);

  return <>{children}</>;
}

function AppContent() {
  return (
    <Router>
      <SessionManager>
        <div className="min-h-screen font-sans transition-colors duration-300 bg-neutral-950 text-neutral-50">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join" element={<Join />} />
            <Route path="/queue" element={<QueueStatus />} />
            <Route path="/in-service" element={<InService />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/history" element={<AdminHistory />} />
            <Route path="/admin/campaigns" element={<AdminCampaigns />} />
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
