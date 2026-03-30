import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useShopStatus } from '../hooks/useQueue';
import { Scissors, Phone, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

import { useShopSettings } from '../hooks/useShopSettings';

export default function Home() {
  const [ddd, setDdd] = useState('21');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { isOpen, message, loading: statusLoading } = useShopStatus();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { shopName, logoUrl } = useShopSettings();

  React.useEffect(() => {
    // Simple test query to check connection
    async function testConnection() {
      try {
        const { error } = await supabase.from('barbershop_schedule').select('count', { count: 'exact', head: true });
        if (error) {
          console.error('Supabase connection error:', error);
          setConnectionError(error.message);
        }
      } catch (err: any) {
        setConnectionError(err.message || 'Failed to connect to Supabase');
      }
    }
    testConnection();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 8) {
      toast.error('Por favor, insira um número de telefone válido');
      return;
    }

    setLoading(true);
    const fullPhone = `${ddd}${phone}`;
    
    try {
      // Check if already in queue
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', fullPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (customer) {
        const { data: queueEntry } = await supabase
          .from('queue')
          .select('*')
          .eq('customer_id', customer.id)
          .in('status', ['waiting', 'serving'])
          .maybeSingle();

        if (queueEntry) {
          toast.success('Você já está na fila!');
          localStorage.setItem('barber_customer_id', customer.id);
          localStorage.setItem('barber_queue_id', queueEntry.id);
          navigate('/queue');
          return;
        }
      }

      // If not in queue, go to join page
      navigate('/join', { state: { phone: fullPhone } });
    } catch (error) {
      console.error(error);
      toast.error('Algo deu errado. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (statusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-neutral-50 dark:bg-neutral-950">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 text-center"
      >
        <div className="flex flex-col items-center space-y-2">
          <div className={`overflow-hidden transition-all duration-500 ${
            logoUrl 
            ? 'h-32 w-32 rounded-3xl' 
            : 'rounded-2xl bg-emerald-600 p-4 shadow-lg shadow-emerald-200 dark:shadow-none'
          }`}>
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={shopName} 
                className="h-full w-full object-contain" 
                referrerPolicy="no-referrer" 
              />
            ) : (
              <Scissors className="h-10 w-10 text-white" />
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">{shopName}</h1>
          <p className="text-neutral-500 italic dark:text-neutral-400">A maneira mais inteligente de esperar pelo seu corte.</p>
        </div>

        {connectionError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm text-left dark:bg-red-900/20 dark:border-red-900/30 dark:text-red-400">
            <p className="font-bold flex items-center">
              <AlertCircle className="mr-2 h-5 w-5" />
              Erro de Conexão com o Banco
            </p>
            <p className="mt-2 text-sm opacity-90">
              Não foi possível buscar dados do Supabase. Verifique se:
            </p>
            <ul className="mt-2 list-disc pl-5 text-xs space-y-1 opacity-80">
              <li>As chaves no painel <strong>Secrets</strong> estão corretas.</li>
              <li>O RLS (Row Level Security) está desativado ou com políticas públicas.</li>
              <li>A URL do projeto está correta: <code className="bg-red-100 px-1 rounded dark:bg-red-900/40">{supabaseUrl}</code></li>
            </ul>
            <p className="mt-3 text-[10px] font-mono break-all opacity-60">Erro: {connectionError}</p>
          </div>
        )}

        {!isOpen && !connectionError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400">
            <p className="font-medium">A barbearia está fechada no momento.</p>
            <p className="mt-1 text-sm opacity-90">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="flex space-x-2">
              <div className="relative w-24 shrink-0">
                <select
                  value={ddd}
                  onChange={(e) => setDdd(e.target.value)}
                  className="h-14 w-full appearance-none rounded-2xl border border-neutral-200 bg-white px-4 text-lg shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none dark:bg-neutral-900 dark:border-neutral-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                >
                  {[
                    '11', '12', '13', '14', '15', '16', '17', '18', '19',
                    '21', '22', '24', '27', '28', '31', '32', '33', '34', '35', '37', '38',
                    '41', '42', '43', '44', '45', '46', '47', '48', '49',
                    '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68', '69',
                    '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87', '88', '89',
                    '91', '92', '93', '94', '95', '96', '97', '98', '99'
                  ].map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>

              <div className="relative flex-1">
                <Phone className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Número (ex: 999999999)"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 9) setPhone(val);
                  }}
                  className="h-14 w-full rounded-2xl border border-neutral-200 bg-white px-12 text-lg shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none dark:bg-neutral-900 dark:border-neutral-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex h-14 w-full items-center justify-center rounded-2xl bg-neutral-900 text-lg font-semibold text-white shadow-lg transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-70 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  Entrar na Fila
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="pt-8 text-xs text-neutral-400 uppercase tracking-widest">
          Powered by {shopName} Tech
        </div>
      </motion.div>
    </div>
  );
}
