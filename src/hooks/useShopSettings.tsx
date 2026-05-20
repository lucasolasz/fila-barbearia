import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useLayoutEffect,
} from "react";
import { supabase } from "../lib/supabase";

interface ShopSettingsContextType {
  theme: "light" | "dark";
  shopName: string;
  logoUrl: string | null;
  webhookUrl: string | null;
  trackingUrlBase: string | null;
  baseQueueTime: number | null;
  isLunchPaused: boolean;
  isPreOpening: boolean;
  setTheme: (theme: "light" | "dark") => void;
}

const ShopSettingsContext = createContext<ShopSettingsContextType | undefined>(
  undefined,
);

export function useShopSettingsHook() {
  const getInitialTheme = () => {
    try {
      const stored = localStorage.getItem("barber_theme");
      if (stored === "dark" || stored === "light") return stored;
    } catch (e) {}
    return "dark";
  };

  const getInitialShopName = () => {
    try {
      const stored = localStorage.getItem("barber_shop_name");
      if (stored) return stored;
    } catch (e) {}
    return "BarberQueue";
  };

  const getInitialLogoUrl = () => {
    try {
      const stored = localStorage.getItem("barber_logo_url");
      if (stored) return stored;
    } catch (e) {}
    return null;
  };

  const [settings, setSettings] = useState({
    theme: getInitialTheme() as "light" | "dark",
    shopName: getInitialShopName(),
    logoUrl: getInitialLogoUrl(),
    webhookUrl: null as string | null,
    trackingUrlBase: null as string | null,
    baseQueueTime: null as number | null,
    isLunchPaused: false,
    isPreOpening: false,
  });

  const setTheme = (theme: "light" | "dark") => {
    localStorage.setItem("barber_theme", theme);
    setSettings((prev) => ({ ...prev, theme }));
  };

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase
        .from("shop_settings")
        .select(
          "theme, shop_name, logo_url, webhook_url, tracking_url_base, base_queue_time, is_lunch_paused, is_pre_opening",
        )
        .limit(1)
        .maybeSingle();
      if (data) {
        const fetchedTheme = data.theme || "dark";
        const fetchedShopName = data.shop_name || "BarberQueue";
        const fetchedLogoUrl = data.logo_url;

        localStorage.setItem("barber_theme", fetchedTheme);
        localStorage.setItem("barber_shop_name", fetchedShopName);
        if (fetchedLogoUrl)
          localStorage.setItem("barber_logo_url", fetchedLogoUrl);

        setSettings({
          theme: fetchedTheme,
          shopName: fetchedShopName,
          logoUrl: fetchedLogoUrl,
          webhookUrl: data.webhook_url,
          trackingUrlBase: data.tracking_url_base,
          baseQueueTime: data.base_queue_time,
          isLunchPaused: data.is_lunch_paused ?? false,
          isPreOpening: data.is_pre_opening ?? false,
        });
      }
    }

    fetchSettings();

    const channel = supabase
      .channel("shop_settings_updates")
      .on(
        "postgres_changes",
        { event: "*", table: "shop_settings" },
        (payload: any) => {
          if (payload.new) {
            const fetchedTheme = payload.new.theme || "dark";
            const fetchedShopName = payload.new.shop_name || "BarberQueue";
            const fetchedLogoUrl = payload.new.logo_url;

            localStorage.setItem("barber_theme", fetchedTheme);
            localStorage.setItem("barber_shop_name", fetchedShopName);
            if (fetchedLogoUrl)
              localStorage.setItem("barber_logo_url", fetchedLogoUrl);

            setSettings({
              theme: fetchedTheme,
              shopName: fetchedShopName,
              logoUrl: fetchedLogoUrl,
              webhookUrl: payload.new.webhook_url,
              trackingUrlBase: payload.new.tracking_url_base,
              baseQueueTime: payload.new.base_queue_time,
              isLunchPaused: payload.new.is_lunch_paused ?? false,
              isPreOpening: payload.new.is_pre_opening ?? false,
            });
          }
        },
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchSettings();
    }, 10000); // Poll settings less frequently (10s)

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  useLayoutEffect(() => {
    if (settings.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.theme]);

  return { ...settings, setTheme };
}

export function ShopSettingsProvider({ children }: { children: ReactNode }) {
  const settings = useShopSettingsHook();

  return (
    <ShopSettingsContext.Provider value={settings}>
      {children}
    </ShopSettingsContext.Provider>
  );
}

export function useShopSettings() {
  const context = useContext(ShopSettingsContext);
  if (context === undefined) {
    // Return default if not within provider (useful for SSR or tests)
    return {
      theme: "dark" as "light" | "dark",
      shopName: "BarberQueue",
      logoUrl: null as string | null,
      webhookUrl: null as string | null,
      trackingUrlBase: null as string | null,
      baseQueueTime: null as number | null,
      isLunchPaused: false,
      isPreOpening: false,
      setTheme: () => {},
    };
  }
  return context;
}
