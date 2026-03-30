import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ShopSettingsContextType {
  theme: 'light' | 'dark';
  shopName: string;
  logoUrl: string | null;
  webhookUrl: string | null;
  trackingUrlBase: string | null;
}

const ShopSettingsContext = createContext<ShopSettingsContextType | undefined>(undefined);

export function useShopSettingsHook() {
  const [settings, setSettings] = useState({
    theme: 'light' as 'light' | 'dark',
    shopName: 'BarberQueue',
    logoUrl: null as string | null,
    webhookUrl: null as string | null,
    trackingUrlBase: null as string | null
  });

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase.from('shop_settings').select('theme, shop_name, logo_url, webhook_url, tracking_url_base').limit(1).maybeSingle();
      if (data) {
        setSettings({
          theme: data.theme || 'light',
          shopName: data.shop_name || 'BarberQueue',
          logoUrl: data.logo_url,
          webhookUrl: data.webhook_url,
          trackingUrlBase: data.tracking_url_base
        });
      }
    }

    fetchSettings();

    const channel = supabase
      .channel('shop_settings_updates')
      .on('postgres_changes', { event: '*', table: 'shop_settings' }, (payload: any) => {
        if (payload.new) {
          setSettings({
            theme: payload.new.theme || 'light',
            shopName: payload.new.shop_name || 'BarberQueue',
            logoUrl: payload.new.logo_url,
            webhookUrl: payload.new.webhook_url,
            trackingUrlBase: payload.new.tracking_url_base
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  return settings;
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
      theme: 'light' as 'light' | 'dark',
      shopName: 'BarberQueue',
      logoUrl: null as string | null,
      webhookUrl: null as string | null,
      trackingUrlBase: null as string | null
    };
  }
  return context;
}
