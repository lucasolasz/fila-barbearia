import { useState, useEffect } from 'react';
import { supabase, Schedule, ScheduleException } from '../lib/supabase';
import { format, getDay, parseISO } from 'date-fns';

export function useShopStatus() {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        const weekday = getDay(now);
        const currentTime = format(now, 'HH:mm:ss');

        // 1. Check manual override first
        const { data: settings } = await supabase
          .from('shop_settings')
          .select('manual_status')
          .limit(1)
          .maybeSingle();

        if (settings && settings.manual_status !== 'auto') {
          if (settings.manual_status === 'open') {
            setIsOpen(true);
            setMessage('');
          } else {
            setIsOpen(false);
            setMessage('A barbearia está fechada manualmente pelo administrador.');
          }
          setLoading(false);
          return;
        }

        // 2. Check exceptions
        const { data: exception } = await supabase
          .from('schedule_exceptions')
          .select('*')
          .eq('date', todayStr)
          .single();

        if (exception) {
          if (exception.is_closed) {
            setIsOpen(false);
            setMessage('A barbearia está fechada hoje devido a um feriado ou evento especial.');
          } else if (exception.open_time && exception.close_time) {
            const open = exception.open_time;
            const close = exception.close_time;
            if (currentTime >= open && currentTime <= close) {
              setIsOpen(true);
            } else {
              setIsOpen(false);
              setMessage(`A barbearia está fechada. Horário especial de hoje: ${open.slice(0, 5)} - ${close.slice(0, 5)}`);
            }
          }
        } else {
          // Check regular schedule
          const { data: schedule, error: schedError } = await supabase
            .from('barbershop_schedule')
            .select('*')
            .eq('weekday', weekday)
            .maybeSingle();

          if (schedule) {
            if (schedule.is_closed) {
              setIsOpen(false);
              setMessage('A barbearia está fechada hoje.');
            } else if (schedule.open_time && schedule.close_time) {
              const open = schedule.open_time;
              const close = schedule.close_time;
              if (currentTime >= open && currentTime <= close) {
                setIsOpen(true);
              } else {
                setIsOpen(false);
                setMessage(`A barbearia está fechada. Horário normal: ${open.slice(0, 5)} - ${close.slice(0, 5)}`);
              }
            } else {
              // Schedule exists but no times set
              setIsOpen(true);
            }
          } else {
            // No schedule found for today, default to open so app is usable
            setIsOpen(true);
            if (schedError) {
              console.warn('Schedule table might not be initialized:', schedError);
            }
          }
        }
      } catch (error) {
        console.error('Error checking shop status:', error);
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return { isOpen, message, loading };
}

export function useQueueCount() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCount() {
      const { count: queueCount, error } = await supabase
        .from('queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');

      if (!error && queueCount !== null) {
        setCount(queueCount);
      }
    }

    fetchCount();

    const channel = supabase
      .channel('public:queue_count')
      .on('postgres_changes' as any, { event: '*', table: 'queue' }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

export function useAverageServiceTime() {
  const [avgTime, setAvgTime] = useState(30);

  useEffect(() => {
    async function fetchAvg() {
      const { data, error } = await supabase
        .from('services')
        .select('duration_minutes')
        .order('created_at', { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        const sum = data.reduce((acc, curr) => acc + curr.duration_minutes, 0);
        setAvgTime(Math.round(sum / data.length));
      }
    }
    fetchAvg();
  }, []);

  return avgTime;
}
