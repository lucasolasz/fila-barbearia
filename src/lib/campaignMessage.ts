/**
 * Nome usado na saudação da campanha. O n8n monta a mensagem final:
 *
 *   Olá <nome>,
 *
 *   <mensagem da campanha>
 *
 * (nó "Enviar Mensagem" do workflow "Barbearia - Campanha").
 * O site grava este nome em campaign_recipients.nome e usa o mesmo formato na pré-visualização.
 */
export function greetingName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  // "JOÃO" / "joão" -> "João"
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}
