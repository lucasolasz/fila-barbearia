import { AgentPromptVersion, supabase } from "../lib/supabase";

/**
 * Prompt do agente de WhatsApp (workflow n8n "Agente - Doncabellone").
 *
 * Histórico append-only em `agent_prompt_versions`: salvar sempre insere
 * uma linha nova e o n8n usa a mais recente. Restaurar uma versão antiga
 * é salvar o texto dela de novo.
 */

/** Token trocado pela data/hora de São Paulo no nó do agente no n8n. */
export const PROMPT_DATETIME_TOKEN = "[DATA_HORA_ATUAL]";

const TABLE = "agent_prompt_versions";

/** Versões mais recentes primeiro. A primeira é a que o agente usa. */
async function listVersions(limit = 20): Promise<AgentPromptVersion[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

async function saveVersion(content: string): Promise<AgentPromptVersion> {
  if (!content.trim()) {
    throw new Error("O prompt não pode ficar vazio.");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ content })
    .select("id, content, created_at")
    .single();

  if (error) throw error;
  return data;
}

export const agentPromptService = { listVersions, saveVersion };
