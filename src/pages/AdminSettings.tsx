import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Schedule, ScheduleException } from '../lib/supabase';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  Calendar, 
  Clock, 
  Loader2,
  CheckCircle2,
  MessageCircle,
  Moon,
  Sun,
  Store,
  Image as ImageIcon,
  Upload,
  Webhook
} from 'lucide-react';
import { webhookService } from '../services/webhookService';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

const WEEKDAYS = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'
];

export default function AdminSettings() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState('+5521999062880');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [shopName, setShopName] = useState('BarberQueue');
  const [logoUrl, setLogoUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [trackingUrlBase, setTrackingUrlBase] = useState('');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{success: boolean, message: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const auth = sessionStorage.getItem('barber_admin_auth');
    if (auth !== 'true') {
      navigate('/admin');
      return;
    }

    async function fetchData() {
      const { data: schedData } = await supabase.from('barbershop_schedule').select('*').order('weekday', { ascending: true });
      const { data: exData } = await supabase.from('schedule_exceptions').select('*').order('date', { ascending: true });
      const { data: settings } = await supabase.from('shop_settings').select('whatsapp_number, theme, shop_name, logo_url, webhook_url, tracking_url_base').limit(1).maybeSingle();
      
      setSchedules(schedData || []);
      setExceptions(exData || []);
      if (settings?.whatsapp_number) {
        setWhatsappNumber(settings.whatsapp_number);
      }
      if (settings?.theme) {
        setTheme(settings.theme);
      }
      if (settings?.shop_name) {
        setShopName(settings.shop_name);
      }
      if (settings?.logo_url) {
        setLogoUrl(settings.logo_url);
      }
      if (settings?.webhook_url) {
        setWebhookUrl(settings.webhook_url);
      }
      if (settings?.tracking_url_base) {
        setTrackingUrlBase(settings.tracking_url_base);
      }

      setLoading(false);
    }
    fetchData();
  }, [navigate]);

  const handleScheduleChange = (index: number, field: keyof Schedule, value: any) => {
    const newSchedules = [...schedules];
    newSchedules[index] = { ...newSchedules[index], [field]: value };
    setSchedules(newSchedules);
  };

  const saveSchedules = async () => {
    setSaving(true);
    try {
      for (const sched of schedules) {
        await supabase.from('barbershop_schedule').upsert(sched);
      }
      
      // Save settings
      const { data: current } = await supabase.from('shop_settings').select('id').limit(1).maybeSingle();
      if (current) {
        await supabase.from('shop_settings').update({ 
          whatsapp_number: whatsappNumber,
          theme: theme,
          shop_name: shopName,
          logo_url: logoUrl || null,
          webhook_url: webhookUrl || null,
          tracking_url_base: trackingUrlBase || null
        }).eq('id', current.id);
      } else {
        await supabase.from('shop_settings').insert([{ 
          manual_status: 'auto', 
          whatsapp_number: whatsappNumber,
          theme: theme,
          shop_name: shopName,
          logo_url: logoUrl || null,
          webhook_url: webhookUrl || null,
          tracking_url_base: trackingUrlBase || null
        }]);
      }

      toast.success('Configurações salvas com sucesso');
    } catch (error) {
      toast.error('Falha ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const addException = async () => {
    const newEx = {
      date: new Date().toISOString().split('T')[0],
      open_time: '09:00',
      close_time: '18:00',
      is_closed: false
    };
    const { data, error } = await supabase.from('schedule_exceptions').insert([newEx]).select().single();
    if (data) setExceptions([...exceptions, data]);
  };

  const updateException = async (id: string, updates: Partial<ScheduleException>) => {
    const { error } = await supabase.from('schedule_exceptions').update(updates).eq('id', id);
    if (!error) {
      setExceptions(exceptions.map(ex => ex.id === id ? { ...ex, ...updates } : ex));
    }
  };

  const deleteException = async (id: string) => {
    const { error } = await supabase.from('schedule_exceptions').delete().eq('id', id);
    if (!error) {
      setExceptions(exceptions.filter(ex => ex.id !== id));
      toast.success('Exceção removida');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    try {
      setSaving(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload para o bucket 'logos'
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Pegar URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
      toast.success('Logo carregada com sucesso! Não esqueça de salvar as alterações.');
    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast.error('Erro ao carregar imagem. Certifique-se de que o bucket "logos" existe e é público no Supabase.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) {
      setWebhookTestResult({ success: false, message: 'Preencha a URL do webhook primeiro.' });
      return;
    }
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const result = await webhookService.testWebhook(webhookUrl, trackingUrlBase);
      setWebhookTestResult(result);
    } catch (error) {
      setWebhookTestResult({ success: false, message: 'Erro inesperado ao testar o webhook.' });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 dark:bg-neutral-950">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md dark:bg-neutral-900/80 dark:border-neutral-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between p-4">
          <button 
            onClick={() => navigate('/admin')}
            className="flex items-center text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar ao Painel
          </button>
          <button 
            onClick={saveSchedules}
            disabled={saving}
            className="flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar Alterações
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Store className="h-6 w-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Identidade da Barbearia</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-neutral-100 space-y-4 dark:bg-neutral-900 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1 dark:text-neutral-300">Nome da Barbearia</label>
              <input 
                type="text" 
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                placeholder="Ex: BarberQueue"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg outline-none focus:border-emerald-500 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1 dark:text-neutral-300">Logo da Barbearia</label>
              <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                <div className="flex-1 space-y-4">
                  <div className="flex space-x-2">
                    <input 
                      type="text" 
                      value={logoUrl}
                      onChange={e => setLogoUrl(e.target.value)}
                      placeholder="https://exemplo.com/logo.png"
                      className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg outline-none focus:border-emerald-500 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                    />
                    <label className="flex cursor-pointer items-center justify-center rounded-xl bg-neutral-100 px-4 py-3 text-neutral-600 hover:bg-neutral-200 transition-colors dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700">
                      <Upload className="h-5 w-5" />
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={saving}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Faça upload de uma imagem ou insira o link direto. Recomendado: PNG ou SVG com fundo transparente.
                  </p>
                </div>
                {logoUrl && (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:bg-neutral-800 dark:border-neutral-700">
                    <img 
                      src={logoUrl} 
                      alt="Preview" 
                      className="h-full w-full object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.src = 'https://picsum.photos/seed/barber/100/100')}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Sun className="h-6 w-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Aparência</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setTheme('light')}
                className={`flex flex-1 items-center justify-center space-x-2 rounded-xl border-2 p-4 transition-all ${
                  theme === 'light' 
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' 
                  : 'border-neutral-100 bg-neutral-50 text-neutral-500 hover:border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600'
                }`}
              >
                <Sun className="h-5 w-5" />
                <span className="font-bold">Tema Claro</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex flex-1 items-center justify-center space-x-2 rounded-xl border-2 p-4 transition-all ${
                  theme === 'dark' 
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' 
                  : 'border-neutral-100 bg-neutral-50 text-neutral-500 hover:border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600'
                }`}
              >
                <Moon className="h-5 w-5" />
                <span className="font-bold">Tema Escuro</span>
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Comunicação</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-neutral-100 space-y-4 dark:bg-neutral-900 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1 dark:text-neutral-300">Número do WhatsApp</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={whatsappNumber}
                  onChange={e => setWhatsappNumber(e.target.value)}
                  placeholder="+5521999999999"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg outline-none focus:border-emerald-500 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                />
              </div>
              <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">Inclua o código do país e DDD (ex: +5521999999999)</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Webhook className="h-6 w-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Integração Webhook</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-neutral-100 space-y-4 dark:bg-neutral-900 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1 dark:text-neutral-300">URL do Webhook</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  type="url" 
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://seu-webhook.com/endpoint"
                  className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg outline-none focus:border-emerald-500 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                />
                <button
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook || !webhookUrl}
                  className="px-4 py-3 bg-neutral-200 text-neutral-700 rounded-xl font-medium hover:bg-neutral-300 disabled:opacity-50 transition-colors dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600 whitespace-nowrap"
                >
                  {isTestingWebhook ? 'Testando...' : 'Testar Envio'}
                </button>
              </div>
              {webhookTestResult && (
                <p className={`mt-2 text-sm font-medium ${webhookTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {webhookTestResult.message}
                </p>
              )}
              <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">URL que receberá os eventos de atualização da fila (JOINED, NEAR, NEXT).</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1 dark:text-neutral-300">URL de Rastreamento (Tracking URL)</label>
              <input 
                type="url" 
                value={trackingUrlBase}
                onChange={e => setTrackingUrlBase(e.target.value)}
                placeholder="https://meuapp.com"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg outline-none focus:border-emerald-500 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
              />
              <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">URL exata enviada no webhook para o cliente acompanhar a fila.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-6 w-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Horário Semanal</h2>
          </div>
          
          <div className="grid gap-3">
            {schedules.map((sched, index) => (
              <div key={sched.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
                <div className="w-24 font-bold text-neutral-900 dark:text-white">{WEEKDAYS[sched.weekday]}</div>
                
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={sched.is_closed}
                      onChange={e => handleScheduleChange(index, 'is_closed', e.target.checked)}
                      className="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
                    />
                    <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Fechado</span>
                  </label>

                  {!sched.is_closed && (
                    <div className="flex items-center space-x-2">
                      <input 
                        type="time" 
                        value={sched.open_time?.slice(0, 5) || ''}
                        onChange={e => handleScheduleChange(index, 'open_time', e.target.value)}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                      />
                      <span className="text-neutral-400 dark:text-neutral-500">até</span>
                      <input 
                        type="time" 
                        value={sched.close_time?.slice(0, 5) || ''}
                        onChange={e => handleScheduleChange(index, 'close_time', e.target.value)}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="h-6 w-6 text-emerald-600" />
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Datas Especiais e Feriados</h2>
            </div>
            <button 
              onClick={addException}
              className="flex items-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Exceção
            </button>
          </div>

          <div className="grid gap-3">
            {exceptions.map((ex) => (
              <div key={ex.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800">
                <input 
                  type="date" 
                  value={ex.date}
                  onChange={e => updateException(ex.id, { date: e.target.value })}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                />
                
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={ex.is_closed}
                      onChange={e => updateException(ex.id, { is_closed: e.target.checked })}
                      className="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
                    />
                    <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Fechado</span>
                  </label>

                  {!ex.is_closed && (
                    <div className="flex items-center space-x-2">
                      <input 
                        type="time" 
                        value={ex.open_time?.slice(0, 5) || ''}
                        onChange={e => updateException(ex.id, { open_time: e.target.value })}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                      />
                      <span className="text-neutral-400 dark:text-neutral-500">até</span>
                      <input 
                        type="time" 
                        value={ex.close_time?.slice(0, 5) || ''}
                        onChange={e => updateException(ex.id, { close_time: e.target.value })}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-emerald-500"
                      />
                    </div>
                  )}

                  <button 
                    onClick={() => deleteException(ex.id)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition-colors dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}

            {exceptions.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 p-8 text-center text-neutral-400 dark:border-neutral-800 dark:text-neutral-600">
                Nenhuma data especial configurada.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
