import { format } from "date-fns";

/**
 * Regras puras de horario da barbearia.
 *
 * Este modulo nao conhece React nem Supabase de proposito: todas as funcoes
 * aqui sao deterministicas e podem ser lidas (e testadas) isoladamente.
 */

/** Duracao assumida quando a entrada da fila nao tem `service_duration`. */
export const DEFAULT_SERVICE_MINUTES = 30;

/** Converte "HH:MM" ou "HH:MM:SS" em minutos desde a meia-noite. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Minutos decorridos desde a meia-noite de hoje.
 *
 * Passa de 1440 quando `date` cai no dia seguinte. E justamente isso que
 * permite comparar corretamente uma fila que atravessa a meia-noite: usar
 * `getHours() * 60 + getMinutes()` faria 01:30 virar 90 e parecer "antes"
 * de um fechamento as 17:00.
 */
export function minutesSinceTodayMidnight(date: Date): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - midnight.getTime()) / 60000);
}

/** Arredonda para o multiplo de 5 minutos mais proximo. */
export function roundToNearest5(date: Date): Date {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const nearest = Math.round(minutes / 5) * 5;

  if (nearest >= 60) {
    rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(nearest - 60);
  } else {
    rounded.setMinutes(nearest);
  }

  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  return rounded;
}

/**
 * Minutos livres entre o fim da fila e o fechamento.
 *
 * Devolve `null` quando nao ha corte a aplicar: sem `close_time` conhecido ou
 * com a fila ainda nao carregada.
 *
 * @param queueTailAt instante em que a fila atual termina de ser atendida
 * @param closeTime   `close_time` do dia, no formato "HH:MM:SS"
 */
export function minutesUntilClosing(
  queueTailAt: Date | null,
  closeTime: string | null,
): number | null {
  if (!closeTime || !queueTailAt) return null;
  return timeToMinutes(closeTime) - minutesSinceTodayMidnight(queueTailAt);
}

/**
 * Regra de corte da fila: o atendimento termina antes do fechamento?
 *
 * @param serviceMinutes duracao do que o novo cliente pretende fazer
 * @returns `true` quando o atendimento cabe ate o horario de fechamento
 */
export function fitsBeforeClosing(
  queueTailAt: Date | null,
  closeTime: string | null,
  serviceMinutes: number,
): boolean {
  const available = minutesUntilClosing(queueTailAt, closeTime);
  return available === null || serviceMinutes <= available;
}

/**
 * Quantas pessoas de `serviceMinutes` ainda cabem antes do fechamento.
 *
 * @param max teto de pessoas permitido por entrada na fila
 */
export function peopleThatFitBeforeClosing(
  queueTailAt: Date | null,
  closeTime: string | null,
  serviceMinutes: number,
  max: number,
): number {
  const available = minutesUntilClosing(queueTailAt, closeTime);
  if (available === null) return max;
  // A guarda de `serviceMinutes` evita que a divisao devolva Infinity.
  if (available <= 0 || serviceMinutes <= 0) return 0;

  return Math.min(max, Math.floor(available / serviceMinutes));
}

/** Horario em que o novo cliente comecaria a ser atendido, pronto para exibicao. */
export function formatQueueTail(queueTailAt: Date | null): string {
  if (!queueTailAt || queueTailAt.getTime() <= Date.now()) return "Agora";
  return format(roundToNearest5(queueTailAt), "HH:mm");
}
