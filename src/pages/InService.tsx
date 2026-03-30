import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, QueueItem } from '../lib/supabase';
import { Scissors, Loader2, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

import { useShopSettings } from '../hooks/useShopSettings';

export default function InService() {
  const navigate = useNavigate();
  const [queueItem, setQueueItem] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const { shopName, logoUrl } = useShopSettings();
  const queueId = localStorage.getItem('barber_queue_id');

  useEffect(() => {
    if (!queueId) {
      navigate('/');
      return;
    }

    async function fetchStatus() {
      const { data, error } = await supabase
        .from('queue')
        .select('*, customer:customer_id(*)')
        .eq('id', queueId)
        .single();

      if (error || !data) {
        clearSession();
        return;
      }

      // Se o status mudar para finalizado ou cancelado, limpa e volta pra home
      if (data.status === 'completed' || data.status === 'cancelled') {
        toast.success(data.status === 'completed' ? 'Atendimento finalizado com sucesso!' : 'Atendimento cancelado.');
        clearSession();
        return;
      }

      // Se por algum motivo voltar para 'waiting', redireciona para /queue
      if (data.status === 'waiting') {
        navigate('/queue');
        return;
      }

      setQueueItem(data);
      setLoading(false);
    }

    const clearSession = () => {
      localStorage.removeItem('barber_queue_id');
      localStorage.removeItem('barber_queue_code');
      localStorage.removeItem('barber_customer_id');
      localStorage.removeItem('barber_customer_phone');
      navigate('/');
    };

    fetchStatus();

    // Inscrição em tempo real para mudanças de status
    const channel = supabase
      .channel('in_service_updates')
      .on('postgres_changes' as any, { event: '*', table: 'queue', filter: `id=eq.${queueId}` }, () => {
        fetchStatus();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queueId, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4 bg-white dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-neutral-500 font-medium dark:text-neutral-400">Carregando seu atendimento...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-neutral-50 dark:bg-neutral-950">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center space-y-8"
      >
        <div className="flex flex-col items-center space-y-4">
          <div className={`overflow-hidden transition-all duration-500 ${
            logoUrl 
            ? 'h-32 w-32 rounded-3xl' 
            : 'rounded-full bg-emerald-100 p-6 dark:bg-emerald-900/30'
          }`}>
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={shopName} 
                className="h-full w-full object-contain animate-pulse" 
                referrerPolicy="no-referrer" 
              />
            ) : (
              <Scissors className="h-12 w-12 text-emerald-600 animate-pulse dark:text-emerald-500" />
            )}
          </div>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight dark:text-white">Você está em atendimento!</h1>
          <p className="text-neutral-500 text-lg dark:text-neutral-400">
            O barbeiro já está cuidando do seu visual. Por favor, aguarde até que o corte seja finalizado.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800 dark:shadow-none">
          <div className="space-y-6">
            <div className="flex items-center justify-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-bold text-neutral-900 uppercase tracking-widest text-sm dark:text-white">Status: Em Serviço</span>
            </div>
            
            <div className="h-px bg-neutral-100 w-full dark:bg-neutral-800" />
            
            <div className="space-y-1">
              <p className="text-xs font-semibold text-neutral-400 uppercase dark:text-neutral-500">Código</p>
              <p className="text-4xl font-black text-neutral-900 dark:text-white">{queueItem?.code}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-neutral-400 uppercase dark:text-neutral-500">Cliente</p>
              <p className="text-xl font-bold text-neutral-900 dark:text-white">{queueItem?.customer?.name}</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          Esta página será fechada automaticamente assim que o barbeiro finalizar o serviço.
        </p>
      </motion.div>
    </div>
  );
}
