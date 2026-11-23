import { Bot, History, Loader2, RotateCcw, Save } from "lucide-react";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AgentPromptVersion } from "../lib/supabase";
import { agentPromptService } from "../services/agentPromptService";

const PREVIEW_LENGTH = 80;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function previewOf(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > PREVIEW_LENGTH
    ? `${singleLine.slice(0, PREVIEW_LENGTH)}…`
    : singleLine;
}

/**
 * Seção do admin para editar a base de conhecimento do agente de WhatsApp.
 * As regras de comportamento ficam fixas no nó do agente no n8n.
 * Tem botão de salvar próprio: cada salvamento vira uma versão nova.
 */
export default function AgentPromptSettings() {
  const [versions, setVersions] = useState<AgentPromptVersion[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const current = versions[0];
  const hasChanges = draft.trim() !== "" && draft !== (current?.content ?? "");

  useEffect(() => {
    agentPromptService
      .listVersions()
      .then((list) => {
        setVersions(list);
        setDraft(list[0]?.content ?? "");
      })
      .catch((error) => {
        console.error("Erro ao carregar prompt:", error);
        toast.error("Erro ao carregar o prompt do assistente.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await agentPromptService.saveVersion(draft);
      setVersions((prev) => [saved, ...prev]);
      toast.success("Prompt salvo! O assistente já usa a nova versão.");
    } catch (error: any) {
      console.error("Erro ao salvar prompt:", error);
      toast.error(error?.message || "Erro ao salvar o prompt.");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = (version: AgentPromptVersion) => {
    setDraft(version.content);
    toast("Versão carregada no editor. Clique em Salvar para aplicar.");
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-emerald-600" />
          <h2 className="text-xl font-bold text-white">
            Assistente Virtual (WhatsApp)
          </h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading || !hasChanges}
          className="flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar prompt
        </button>
      </div>

      <div className="rounded-2xl bg-neutral-900 p-6 shadow-sm border border-neutral-800 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              Texto livre com as informações da barbearia que o assistente
              usa para responder: preços, horários, produtos, avisos etc. O
              jeito de conversar e as regras da fila já são fixos no
              assistente.
            </p>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={25}
              spellCheck={false}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 font-mono text-sm text-white outline-none focus:border-emerald-500 transition-all"
            />

            <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-500">
              <span>{draft.length.toLocaleString("pt-BR")} caracteres</span>
              {current && (
                <span>Última alteração: {formatDateTime(current.created_at)}</span>
              )}
            </div>

            {versions.length > 1 && (
              <div className="space-y-2 border-t border-neutral-800 pt-4">
                <div className="flex items-center space-x-2 text-sm font-bold text-neutral-300">
                  <History className="h-4 w-4" />
                  <span>Versões anteriores</span>
                </div>
                {versions.slice(1).map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between gap-4 rounded-xl bg-neutral-800 px-4 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-400">
                        {formatDateTime(version.created_at)}
                      </p>
                      <p className="truncate text-sm text-neutral-300">
                        {previewOf(version.content)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(version)}
                      className="flex shrink-0 items-center rounded-lg px-3 py-1 text-sm font-bold text-emerald-500 hover:bg-emerald-900/20 transition-colors"
                    >
                      <RotateCcw className="mr-1 h-4 w-4" />
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
