# O que é este projeto?

Fila digital para uma barbearia com apenas 1 barbeiro.

# Regras de negocio

- O cliente que esta com status serving é a posicao 1 da fila.
- Posicao do cliente = contagem de linhas ativas (waiting + serving), nunca a coluna `position` crua.
- A coluna `position` pode ter buracos. Quem renumera para 1..N é a aplicacao, em `src/lib/queuePositions.ts`, depois de TODA mudanca de status.
- Pessoas na frente = posicao - 1. Inclui quem esta em atendimento.
- Convidado/manual (`is_manual = true` ou telefone `manual_%`) ocupa cadeira: conta na posicao e no ETA (horario estimado de atendimento), mas nao recebe mensagem.
- ETA sempre arredondado para o multiplo de 5 min mais proximo. Site e n8n usam a mesma regra, senao divergem.
- Notificacao de mudanca de posicao sai no ENCERRAMENTO do atendimento. Iniciar com a cadeira vazia nao move ninguem. So dispara com o painel do barbeiro aberto.
- Aviso de atraso é 100% n8n (roda a cada 5 min), independe do painel. Cooldown de 10 min por cliente, sem limite de posicao.
- Atendimento estourado: a duracao vira "tempo decorrido + 10 min" (teto 180) a cada ciclo do n8n.

# Locais de hospedagem

- Projeto de producao esta hospedado na Vercel.
- Projeto utiliza o supabase para banco de dados.

# Banco de dados

- O MCP supabase configurado em modo leitura está lendo dados de producao e o projeto que esta sendo executado aqui está em desenvolvimento.

# Regras de desenvolvimento

- Sempre utilize as melhores tecnicas de clean code
- Sempre evite duplicidade de códigos
- Toda modificacao que necessitar de alteracao no banco de dados, crie arquivos de migrations com versoes sequenciais: V01, V02 etc.
- `migrations/migration-manual.sql` é historico: nao anexar nada novo nele. A proxima alteracao começa em `migrations/V01__descricao.sql`.
- Toda migration tambem atualiza o estado-alvo completo em `supabase_schema.sql`.
- Nada de trigger ou function no banco. Toda regra fica no codigo da aplicacao ou na query do n8n.
- Implementacoes claras para que eu tambem consiga realizar ajustes e manutencoes sem muito esforco para entender os fluxos das funcoes
