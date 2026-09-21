import { QueueItem, supabase } from "./supabase";

/** Só o que importa para renumerar: identidade, posição atual e status. */
type ActiveEntry = Pick<QueueItem, "id" | "position" | "status">;

/** Ordem que o cliente enxerga: quem está em atendimento primeiro. */
function byServingFirst(a: ActiveEntry, b: ActiveEntry): number {
  if (a.status === b.status) return a.position - b.position;
  return a.status === "serving" ? -1 : 1;
}

/**
 * Renumera as linhas ativas da fila para 1..N: quem está em atendimento vira
 * a posição 1 e quem está esperando vem na sequência, mantendo a ordem atual.
 *
 * Precisa rodar DEPOIS de toda mudança de status (entrar, sair, iniciar,
 * finalizar, cancelar). Sem isso a coluna `position` fica com buracos — e
 * qualquer consumidor que confie nela, como a automação de atraso no n8n,
 * passa a contar gente que já saiu da fila.
 *
 * Nunca lança: falhar em renumerar não pode derrubar a ação do usuário.
 */
export async function normalizeQueuePositions(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("queue")
      .select("id, position, status")
      .in("status", ["serving", "waiting"])
      .order("position", { ascending: true });

    if (error) throw error;

    const updates = [...((data ?? []) as ActiveEntry[])]
      .sort(byServingFirst)
      .map((entry, index) => ({ entry, desiredPosition: index + 1 }))
      .filter(({ entry, desiredPosition }) => entry.position !== desiredPosition)
      .map(({ entry, desiredPosition }) =>
        supabase
          .from("queue")
          .update({ position: desiredPosition })
          .eq("id", entry.id),
      );

    if (updates.length > 0) await Promise.all(updates);
  } catch (err) {
    console.error("Falha ao normalizar as posições da fila:", err);
  }
}
