-- =====================================
-- V05 — Prompt do agente: só a base de conhecimento fica no banco
-- =====================================
-- As regras de comportamento, formato e fila do agente "Atendente Barbearia"
-- voltam a ficar fixas no systemMessage do nó do n8n (workflow
-- "Agente - Doncabellone"). O nó insere o `content` da versão mais recente
-- no meio do prompt, na seção "7. BASE DE CONHECIMENTO".
--
-- O admin passa a editar só os dados da barbearia (preços, horários,
-- produtos, avisos). O token [DATA_HORA_ATUAL] deixa de existir: a data/hora
-- fica no texto fixo do n8n.
--
-- Só dados, sem mudança de estrutura. Histórico append-only: insere uma
-- versão nova, a não ser que este mesmo texto já exista.
--
-- Rodar junto com a publicação do workflow novo no n8n (um logo após o
-- outro): o workflow antigo usaria só a base como prompt inteiro, e o novo
-- com a versão antiga no banco repetiria as regras.
--
-- ATENÇÃO: se o barbeiro já editou o prompt pelo admin em produção, copie
-- os dados atualizados da versão vigente para este texto antes de rodar.
WITH nova AS (
  SELECT $base$DADOS DA BARBEARIA
Nome: Don Cabellone Barbearia
Nome do barbeiro: Wagner
Endereço: Rua Andrócles, 137, Curicica, Jacarepaguá, na esquina com a Rua Catargo
WhatsApp (preferência por ligação): (21) 99906-2880
Fila virtual: https://doncabellone.com.br
Instagram: https://www.instagram.com/doncabellone
Avaliações no Google: https://share.google/kVwkFq8OfJrTKQuRi

HORÁRIO DE FUNCIONAMENTO
Terça a sexta: 09h às 18h
Sábado: 08h às 17h
Domingo e segunda: fechado
Feriados: normalmente das 08h às 12h, mas eventualmente pode fechar. Para confirmar um feriado específico, use a MENSAGEM PADRÃO.

SERVIÇOS E PREÇOS
Corte masculino: R$ 35,00
Barba: R$ 25,00
Barba na maquininha: R$ 15,00
Pezinho: R$ 15,00
Sobrancelha: R$ 5,00
Tempo médio de corte: 30 minutos
Tempo médio de atendimento: entre 30 minutos e 1 hora

CORTES
Fazemos: corte masculino, degradê, corte social, moicano e riscos simples.
Não fazemos: corte totalmente na tesoura, pigmentação, tintura, descoloração ("nevou") e toalha quente.
Como são feitos: máquina nas laterais, acabamento com máquina, tesoura apenas no topo quando necessário.

CORTE INFANTIL
Atendemos crianças somente a partir de 6 anos.

PLANO DE ASSINATURA
Não trabalhamos com plano de assinatura.

FORMAS DE PAGAMENTO
Pix, cartão de crédito, cartão de débito e dinheiro.
Chave Pix: (21) 99906-2880 (banco Mercado Pago)

PRODUTOS À VENDA
Pomada modeladora: R$ 30,00
Balm para barba: R$ 25,00
Óleo para barba: R$ 25,00
Kit cabelo: R$ 45,00
Kit barba: R$ 45,00

BEBIDAS
Coca-Cola 2L: R$ 13,00
Coca-Cola lata: R$ 6,00
Coca-Cola KS: R$ 5,00
Guaravita: R$ 2,50
Água sem gás: R$ 3,00
Água com gás: R$ 4,00
Água 1,5L: R$ 5,00
Sacolé: R$ 5,00

LANCHES
Amendoim: R$ 1,00
Freegells: R$ 2,00
Mentos: R$ 3,00
Doces: R$ 2,50
Torcida: R$ 4,00
Trakinas: R$ 4,00

ESTRUTURA
Wi-Fi e banheiro disponíveis. Acompanhantes são permitidos.


—-
Obs: Dia 20/11/2026(feriado) não funcionaremos.$base$::text AS content
)
INSERT INTO public.agent_prompt_versions (content)
SELECT nova.content
FROM nova
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_prompt_versions v WHERE v.content = nova.content
);
