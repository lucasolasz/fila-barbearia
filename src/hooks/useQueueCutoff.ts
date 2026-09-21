import { useCallback, useEffect, useState } from "react";
import { addMinutes } from "date-fns";
import { fetchQueueTailWaitMinutes } from "./useQueue";
import { fitsBeforeClosing } from "../lib/schedule";

/** Mesma cadencia do polling anterior da home — nao aumenta o numero de requisicoes. */
const REFRESH_INTERVAL_MS = 20000;

/**
 * Decide se ainda da tempo de atender um novo cliente antes do fechamento.
 *
 * O hook e o unico dono do polling da fila; a tela so consome `canFit`.
 *
 * @param closeTime `close_time` do dia vindo de `useShopStatus`
 * @param enabled   `false` desliga o corte (pausa para almoco e pre-abertura)
 */
export function useQueueCutoff(closeTime: string | null, enabled: boolean) {
  const [queueTailAt, setQueueTailAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  /** Rebusca a fila e devolve o novo fim, para quem precisa decidir na hora. */
  const refresh = useCallback(async (): Promise<Date> => {
    const waitMinutes = await fetchQueueTailWaitMinutes();
    const tail = addMinutes(new Date(), waitMinutes);

    setQueueTailAt(tail);
    setLoading(false);
    return tail;
  }, []);

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      if (mounted) void refresh();
    };

    tick();
    const interval = setInterval(tick, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [refresh]);

  /**
   * O atendimento cabe antes do fechamento?
   *
   * @param serviceMinutes duracao do que o cliente pretende fazer
   * @param tail           fim da fila a considerar; por padrao o ultimo valor
   *                       carregado, mas o submit passa um recem-buscado
   */
  const canFit = useCallback(
    (serviceMinutes: number, tail: Date | null = queueTailAt) =>
      !enabled || fitsBeforeClosing(tail, closeTime, serviceMinutes),
    [enabled, closeTime, queueTailAt],
  );

  return { queueTailAt, loading, refresh, canFit };
}
