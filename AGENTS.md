# O que é este projeto?

Fila digital para uma barbearia com apenas 1 barbeiro.

# Regras de negocio

- O cliente que esta com status serving é a posicao 1 da fila.
- Posicao do cliente = contagem de linhas ativas (waiting + serving), nunca a coluna `position` crua.
- A coluna `position` pode ter buracos. Quem renumera para 1..N é a aplicacao, em `src/lib/queuePositions.ts`, depois de TODA mudanca de status.
- Pessoas na frente = posicao - 1. Inclui quem esta em atendimento.
- Convidado (`parent_queue_id`) e cliente sem telefone (telefone `manual_%`) ocupam cadeira: contam na posicao e no ETA (horario estimado de atendimento), mas nao recebem mensagem. Regra em `src/lib/queueNotificationRules.ts`.
- ETA sempre arredondado para o multiplo de 5 min mais proximo. Site e n8n usam a mesma regra, senao divergem.
- Notificacao de mudanca de posicao sai no ENCERRAMENTO do atendimento. Iniciar com a cadeira vazia nao move ninguem. So dispara com o painel do barbeiro aberto.
- Nao existe mais aviso de atraso para o cliente. O n8n (a cada 5 min) so recalcula o atendimento estourado e avisa o barbeiro.
- "Sua vez chegou" sai uma unica vez por cliente, pelo evento NEXT. Depois dele o cliente nao recebe mais NEAR/UPDATE.
- Toda mensagem de envio unico (NEXT, NEAR, entrada) e marcada no banco ANTES de enviar (`src/lib/queueNotificationFlags.ts`), para dois paineis abertos nao enviarem em dobro.
- Mensagem de entrada (JOINED) sai do site do cliente e grava `joined_notified_at`. Se ficar vazia por mais de 1 min, o painel do barbeiro reenvia.
- Atendimento estourado: a duracao vira "tempo decorrido + 10 min" (teto 180) a cada ciclo do n8n.
- Campanha: o site grava a campanha e os destinatarios (`campaign_recipients`, status `pending`) e chama o n8n so com `{ campaign_id }`. O n8n envia apenas os `pending`. Sem envio ha 10 min, a tela mostra "Interrompida" e permite "Retomar envio", que chama o n8n de novo sem reenviar para quem ja recebeu. Regra em `src/lib/campaignProgress.ts`.

# Locais de hospedagem

- Projeto de producao esta hospedado na Vercel.
- Projeto utiliza o supabase para banco de dados.

# Banco de dados

- O MCP supabase (`.mcp.json`, project_ref `cvyhwjhkoikzophdbkxs`) esta em modo leitura e aponta para a base de DESENVOLVIMENTO, a mesma do projeto executado aqui.

# Regras de desenvolvimento

- Sempre utilize as melhores tecnicas de clean code
- Sempre evite duplicidade de códigos
- Toda modificacao que necessitar de alteracao no banco de dados, crie arquivos de migrations com versoes sequenciais: V01, V02 etc.
- `migrations/migration-manual.sql` é historico: nao anexar nada novo nele. A proxima alteracao começa em `migrations/V01__descricao.sql`.
- Toda migration tambem atualiza o estado-alvo completo em `supabase_schema.sql`.
- Nada de trigger ou function no banco. Toda regra fica no codigo da aplicacao ou na query do n8n.
- Implementacoes claras para que eu tambem consiga realizar ajustes e manutencoes sem muito esforco para entender os fluxos das funcoes
