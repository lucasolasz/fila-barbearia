import { Loader2, RotateCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase, CampaignRecipient } from "../../lib/supabase";

type IssueRow = Pick<CampaignRecipient, "id" | "nome" | "numero" | "status" | "error_message">;

type Props = {
  campaignTitle: string;
  campaignId: string;
  /** Muda quando o realtime avisa alteração: recarrega a lista. */
  failedCount: number;
  /** false enquanto o n8n está enviando: tentar de novo agora enviaria em dobro. */
  canResolve: boolean;
  onRetry: (recipientIds: string[]) => Promise<void>;
  onRemove: (recipientIds: string[]) => Promise<void>;
  onClose: () => void;
};

function issueReason(row: IssueRow): string {
  if (row.status === "invalid_number") return "Número sem WhatsApp";
  return row.error_message || "Erro ao enviar";
}

/**
 * Contatos de uma campanha que não receberam a mensagem (error / invalid_number).
 * O barbeiro resolve cada um: tentar novamente ou excluir da campanha.
 */
export default function CampaignIssues({
  campaignTitle,
  campaignId,
  failedCount,
  canResolve,
  onRetry,
  onRemove,
  onClose,
}: Props) {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function fetchIssues() {
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("id, nome, numero, status, error_message")
        .eq("campaign_id", campaignId)
        .in("status", ["error", "invalid_number"])
        .order("nome", { ascending: true });
      if (error) console.error("Error fetching campaign issues:", error);
      setIssues(data || []);
      setLoading(false);
    }
    fetchIssues();
  }, [campaignId, failedCount]);

  async function run(action: (ids: string[]) => Promise<void>, ids: string[]) {
    setBusy(true);
    try {
      await action(ids);
    } finally {
      setBusy(false);
    }
  }

  const allIds = issues.map((i) => i.id);
  const disabled = busy || !canResolve;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-white">Contatos com problema</h3>
            <p className="truncate text-sm text-neutral-500">{campaignTitle}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!canResolve && (
          <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            Envio em andamento. Aguarde terminar para resolver os contatos.
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : issues.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">Nenhuma pendência. Campanha concluída.</p>
        ) : (
          <>
            <div className="max-h-80 divide-y divide-neutral-800 overflow-y-auto rounded-xl border border-neutral-800">
              {issues.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{row.nome}</p>
                    <p className="text-xs text-neutral-500">{row.numero}</p>
                    <p className="text-xs text-red-400">{issueReason(row)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => run(onRetry, [row.id])}
                      disabled={disabled}
                      className="rounded-lg bg-neutral-800 p-2 text-neutral-300 hover:bg-emerald-600 hover:text-white disabled:opacity-40"
                      title="Tentar novamente"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => run(onRemove, [row.id])}
                      disabled={disabled}
                      className="rounded-lg bg-neutral-800 p-2 text-neutral-300 hover:bg-red-600 hover:text-white disabled:opacity-40"
                      title="Excluir da campanha"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => run(onRetry, allIds)}
                disabled={disabled}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <RotateCw className="h-4 w-4" />
                Tentar todos
              </button>
              <button
                onClick={() => run(onRemove, allIds)}
                disabled={disabled}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-700 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                Excluir todos da campanha
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
