# Contexto do Projeto - Agentes

## Visão Geral do Sistema

Sistema de fila para barbearia com gerenciamento via dashboard admin e check-in via app web. Suporta múltiplas pessoas por entrada (convidados), modo almoço, modo pré-abertura e notificações automáticas via webhook (n8n → WhatsApp).

---

## Fluxo do Cliente (App Web)

### 1. Home (`/`) — Entrada na Fila

- URL: `https://www.doncabellone.com.br`
- Campos: **Quantas pessoas vão cortar** (select 1–5, padrão 1), **Nome** e **Telefone** (com máscara)
- Informações exibidas abaixo dos campos: **posição estimada** e **horário estimado** (formato `"HH:mm"`)
  - Horário estimado é **ocultado** quando `isLunchPaused === true`
- Botão: "Entrar na fila"
- Ao clicar, abre **dialog multi-step de seleção de serviços** — um passo por pessoa
  - Cada passo exibe checkboxes: Cabelo (30min, padrão), Pezinho (10min), Barba (30min), Sobrancelha (5min)
  - Botão "Próximo" avança entre passos; "Confirmar" no último submete
- Ao confirmar, sistema insere entrada principal + entradas de convidados na fila e envia webhook:
  - `JOINED_IN_LUNCH` se `isLunchPaused`
  - `JOINED_IN_PRE_OPENING` se `isPreOpening`
  - `JOINED` caso contrário

### 2. Queue (`/queue`) — Status na Fila

- Exibe: **código da fila**, **posição na fila**
- Horário estimado: formato `"HH:mm"` arredondado para múltiplo de 5 min
- Horário estimado ocultado em modo almoço
- Botões: seguir no **Instagram**, chamar no **WhatsApp**
- Botão **sair da fila** — se cliente tem convidados ativos (`parent_queue_id`), exibe diálogo com opções "Somente eu" e "Eu e os convidados"
- Webhooks de acompanhamento via n8n: NEXT, NEAR, UPDATE, DELAYED

### 3. InService (`/in-service`)

Tela exibida quando cliente está em atendimento (`status === "serving"`).

---

## Tabelas do Banco de Dados

### 1. `customers`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `name` | Nome do cliente |
| `phone` | Telefone (único). Convidados usam prefixo `manual_${timestamp}_${i}` |
| `created_at` | Data de criação |

---

### 2. `queue`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `code` | Código de 5 caracteres alfanuméricos (ex: "1CMI6") |
| `customer_id` | FK → `customers(id)` ON DELETE CASCADE |
| `position` | Inteiro de ordenação. **NÃO é rank visual**. Próxima entrada = `max(position) entre status ('waiting','serving') + 1`. Quando fila esvazia, volta para 1. Usado para `order by` e drag/drop. |
| `status` | `"waiting" \| "serving" \| "completed" \| "cancelled"` |
| `created_at` | Data de entrada na fila |
| `service_start` | Timestamp início do atendimento |
| `service_end` | Timestamp fim do atendimento |
| `service_duration` | **Duração total dos serviços selecionados em minutos** (ex: Cabelo+Barba = 60). Default 30. Usado no ETA. |
| `selected_services` | `text[]` — IDs dos serviços (`cabelo`, `pezinho`, `barba`, `sobrancelha`). Default `'{}'`. Exibido no `QueueItemCard`. |
| `parent_queue_id` | FK → `queue(id)`. Liga entrada de convidado ao responsável. NULL para clientes normais. |
| `notified_next` | Flag dedupe webhook NEXT |
| `notified_near` | Flag dedupe webhook NEAR |
| `last_update_sent_at` | Timestamp do último webhook UPDATE |
| `last_sent_eta` | Último ETA enviado em minutos. Setado na primeira observação **sem** enviar UPDATE (evita UPDATE redundante junto com JOINED) |
| `last_delay_sent_at` | Timestamp do último webhook DELAYED |

---

### 3. `services` (Histórico)

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `customer_id` | FK → `customers(id)` ON DELETE SET NULL |
| `duration_minutes` | Duração do serviço em minutos |
| `created_at` | Data de realização |

---

### 4. `barbershop_schedule`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `weekday` | 0–6 (0 = domingo). UNIQUE |
| `open_time` | Horário de abertura |
| `close_time` | Horário de fechamento |
| `is_closed` | Dia fechado |

---

### 5. `schedule_exceptions`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `date` | Data específica. UNIQUE |
| `open_time` | Horário de abertura |
| `close_time` | Horário de fechamento |
| `is_closed` | Fechado |

---

### 6. `shop_settings`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `manual_status` | `"auto" \| "open" \| "closed"` |
| `whatsapp_number` | Número de contato |
| `theme` | `"light" \| "dark"` |
| `shop_name` | Nome da barbearia |
| `logo_url` | URL do logo |
| `webhook_url` | URL do webhook n8n |
| `tracking_url_base` | URL base para rastreamento |
| `base_queue_time` | Tempo base por cliente (fallback ETA, minutos) |
| `max_queue_time` | Hora limite para entrar na fila |
| `is_lunch_paused` | **boolean NOT NULL default false**. Pausa fila para almoço |
| `is_pre_opening` | **boolean NOT NULL default false**. Modo pré-abertura (antes do `open_time`) |
| `updated_at` | Timestamp |

Realtime habilitado.

---

### 7. `campaigns`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `title` | Título da campanha |
| `message` | Mensagem (suporta `**negrito**`, `*itálico*`) |
| `is_draft` | Rascunho ou enviada |
| `selected_contact_ids` | `text[]` IDs dos contatos |
| `recipient_count` | Quantidade de destinatários |
| `created_at`, `updated_at` | Timestamps |

RLS desabilitado (acesso admin via service role).

---

## Posição na Fila — Contagem Inclui "serving"

**Regra fundamental**: A pessoa em atendimento (`status === "serving"`) é contada na posição da fila. Se alguém está sendo atendido, próximo cliente vê posição 2, não 1.

| Onde | Como calcula |
|------|-------------|
| `useQueueCount()` | Conta itens `status in ("waiting","serving")`. Posição do novo cliente = `queueCount + 1` |
| `QueueStatus.calculatePosition()` | Conta itens `status in ("waiting","serving")` e `position < currentPosition`, depois `+1` |
| `useWebhookNotifications` | `position = servingCount + waitingIndex + 1`, `peopleAhead = position - 1` |
| NEXT trigger | Dispara quando `position === servingCount + 1` (topo da fila de espera) |
| `normalizeQueuePositions()` | Serving items recebem primeiras posições, depois waiting |

---

## Webhooks

POST para URL configurada em `shop_settings.webhook_url` (n8n em `n8ndes.ltech.app.br`). n8n processa payload e envia **mensagens WhatsApp** automatizadas.

### Eventos

| Evento | Quando | Condições | Cooldown | Flag |
|--------|--------|-----------|----------|------|
| `JOINED` | Cliente entra na fila em horário normal | Imediato no insert (Home, AddCustomerForm). **Não** envia se phone começa com `manual_` | — | — |
| `JOINED_IN_LUNCH` | Cliente entra na fila durante `isLunchPaused` | Substitui `JOINED` quando flag ativa | — | — |
| `JOINED_IN_PRE_OPENING` | Cliente entra na fila durante `isPreOpening` | Substitui `JOINED` quando flag ativa | — | — |
| `LUNCH_START` | Admin ativa modo almoço | Loop por todos `waiting`+`serving` | — | — |
| `LUNCH_END` | Admin desativa modo almoço | Loop por todos `waiting` | — | — |
| `PRE_OPENING_START` | Admin ativa pré-abertura | Loop por todos `waiting`+`serving` | — | — |
| `PRE_OPENING_END` | Admin desativa pré-abertura | Loop por todos `waiting` | — | — |
| `NEXT` | Cliente chega ao topo da espera | `position === servingCount + 1` E `lastPos > servingCount + 1` E `!notified_next` | One-time | `notified_next` |
| `NEAR` | Cliente próximo (posição ≤ 3) | `position <= 3` E `lastPos > 3` E `!notified_near` | One-time | `notified_near` |
| `UPDATE` | Posição mudou e ETA mudou | `\|ETA_novo - ETA_antigo\| >= 10min` E cooldown 5min. **Não dispara junto com JOINED**: primeira observação seta `last_sent_eta` sem enviar | 5 min | `last_update_sent_at`, `last_sent_eta` |
| `DELAYED` | Atendimento em atraso | `elapsed > service_duration` do serving. Enviado para cada `waiting` individualmente, cooldown 10min por item | 10 min/item | `last_delay_sent_at` |

**Prioridade entre NEXT/NEAR/UPDATE**: NEXT > NEAR > UPDATE. Se NEXT dispara, NEAR e UPDATE não disparam para o mesmo item na mesma verificação.

**Payload position**: rank ativo (`queueCount + 1`), nunca o campo DB `position`.

### Payload

```typescript
{
  type: "QUEUE_UPDATE",
  event: WebhookEvent,
  user: { name: string, phone: string },  // phone com "55" prefixo
  queue: { position: number, peopleAhead: number, etaMinutes: number, estimatedWait: string },
  establishment: { name: string },
  trackingUrl: string
}
```

### DELAYED — detalhes

- `elapsed = minutos desde service_start do serving`
- `plannedDuration = serving.service_duration ?? 30`
- Dispara apenas quando `elapsed > plannedDuration`
- Loop por todos `waiting`; cada item recebe webhook com cooldown 10min próprio (`last_delay_sent_at`)
- Verificação por intervalo de 1 min (`setInterval`)
- Posição enviada: `itemPosition = i + 2` (1 = serving, espera começa em 2)

### NEXT — detalhes

- Dispara só quando cliente **moveu para** `servingCount + 1` vindo de posição mais alta
- Evita NEXT para quem entrou direto no topo
- Após sucesso, seta `notified_next: true`

### NEAR — detalhes

- Cruza barreira das 3 posições (de >3 para ≤3)
- NEXT prioritário se ambos aplicarem
- Após sucesso, seta `notified_near: true`

### UPDATE — detalhes

- Dois caminhos: posição mudou (em `lastPos !== position`) ou ETA drift com posição constante
- Primeira observação de item (`lastPos === undefined`): seta `last_sent_eta` no DB e **não** envia webhook — evita UPDATE redundante imediatamente após JOINED

### Modo Almoço / Pré-Abertura

- `LUNCH_START` / `PRE_OPENING_START`: enviado para todo `waiting`+`serving` ao ativar
- `LUNCH_END` / `PRE_OPENING_END`: enviado para todo `waiting` ao desativar (`serving` exclui)
- Ao desativar almoço, sistema **recalcula tempo médio** baseado no estado pós-almoço

### AddCustomerForm — phone "manual_"

Admin pode adicionar cliente manualmente. Se phone começa com `manual_`, webhook `JOINED*` **não é enviado**.

---

## Tempo Estimado de Serviço — Dinâmico por `service_duration`

ETA = soma de `service_duration` real de cada entrada à frente (não média fixa).

| Função | Comportamento |
|--------|--------------|
| `calculateEstimatedServiceTimeDynamic(pos)` | Busca ativos com `service_duration`. Soma à frente. Retorna `"HH:mm"` |
| `calculateEstimatedMinutes(pos)` | Mesma lógica, retorna minutos numéricos (para `etaMinutes`) |
| `calculateEstimatedServiceTime(pos, avgDuration?)` | Fallback estático síncrono; default 37 |
| `useAverageServiceTime()` | Retorna `37` — fallback quando `service_duration` ausente |

**Fallback**: `service_duration` null → 30 min (default DB) ou 37 min (heurística antiga).

### Arredondamento

Múltiplo de 5 min mais próximo. Exemplo: 9:47 → 9:45.

### Formato

String única `"HH:mm"` — não mais intervalo `"HH:mm e HH:mm"`.

### Drift baseado em tempo

Verificado em `useWebhookNotifications` mesmo quando posição não mudou (envia UPDATE se ETA drift ≥ 10min e cooldown OK).

---

## ETA — Não Contabilizar em Dobro o "serving"

```typescript
const waitingAhead = Math.max(0, posicaoNaFila - 1 - servingCount);
// totalMin = remainingCurrent + waitingAhead * avg
```

Para posição 1, ETA considera só `remainingCurrent` do atendimento atual.

---

## Convidados (Múltiplas Pessoas)

### Padrão de criação
- Responsável preenche nome/telefone + quantidade (1–5)
- Confirma serviços por pessoa
- Sistema cria 1 entrada normal + N entradas com `parent_queue_id = queueEntry.id`

### Identificação
| Campo | Valor |
|---|---|
| `customers.phone` | `manual_${Date.now()}_${i}` |
| `customers.name` | `"Convidado de ${nome}"` |
| `queue.parent_queue_id` | ID do responsável |
| `queue.service_duration` | Calculado dos serviços daquele convidado |
| `queue.selected_services` | Array dos IDs escolhidos |

### Dashboard (QueueItemCard)
Prefixo `manual_` aciona comportamento existente:
- Oculta telefone
- Oculta botão WhatsApp
- Mantém "Iniciar atendimento" e "Excluir"
- Exibe ícone link para `parent_queue_id`
- Exibe chips de `selected_services`

### Saída com convidados (QueueStatus)
- Consulta `queue WHERE parent_queue_id = queueId AND status IN ('waiting','serving')`
- Se há convidados: diálogo "Somente eu" / "Eu e os convidados"
- **Sem localStorage** — relação 100% via DB

### Webhooks
- `JOINED*` enviado só para responsável
- Convidados com `manual_` filtrados em todos webhooks

---

## Serviços Disponíveis

`src/constants/constants.ts → BARBER_SERVICES`:

| id | label | duration |
|---|---|---|
| cabelo | Cabelo | 30 min |
| pezinho | Só pezinho | 10 min |
| barba | Barba | 30 min |
| sobrancelha | Sobrancelha | 5 min |

`ServiceId = "cabelo" | "pezinho" | "barba" | "sobrancelha"`

---

## Campo `position` — Detalhes

`position` no DB é:
- Chave de ordenação SQL (`order("position", { ascending: true })`)
- Persistência de ordem após drag/drop manual
- **Não é rank visual**

### Cálculo do próximo `position`

Tanto `Home.tsx` quanto `AddCustomerForm.tsx`:

```ts
const { data: last } = await supabase
  .from("queue")
  .select("position")
  .in("status", ["waiting", "serving"])   // filtra ativos
  .order("position", { ascending: false })
  .limit(1)
  .maybeSingle();
const nextPos = (last?.position || 0) + 1;
```

Filtro por status ativo garante que `position` reseta para 1 quando fila esvazia. Antes (sem filtro) crescia para sempre incluindo `completed`/`cancelled`.

### Rank visual sempre runtime

- Home: `queueCount + 1` (`queueCount` inclui `waiting`+`serving`)
- QueueStatus: contagem ativos com `position < currentPosition` +1
- AdminDashboard: `servingCount + waitingIndex + 1`

---

## AdminDashboard — Notificações

`useWebhookNotifications` processa webhooks em tempo real:

1. Carrega itens `waiting`+`serving`
2. Calcula rank `servingCount + waitingIndex + 1`
3. Verifica flags `notified_next` / `notified_near` no DB
4. Verifica `last_sent_eta` / `last_update_sent_at` para UPDATE
5. Se condições atendidas → envia webhook + atualiza flag/timestamp

**Não há reset automático de flags** baseado em `peopleAhead`. Reset só em reorder manual (drag/drop).

---

## AdminDashboard — Card do Cliente (QueueItemCard)

Por item exibe:
- Código, nome, telefone (oculto se `manual_`)
- **Horário de entrada** (`created_at`) com segundos: `DD/MM/AA, HH:mm:ss`
- **Início do atendimento** (`service_start`) para `serving`: `"Iniciou: HH:mm:ss"` em verde
- **Chips de serviços** (`selected_services`)
- **Ícone link** se `parent_queue_id` (convidado)

---

## Modo Almoço e Pré-Abertura

### Controle (AdminHeader)
- Botões dedicados para alternar `is_lunch_paused` e `is_pre_opening`
- Almoço só ativa com loja aberta
- Pré-abertura só ativa em modo `auto` E loja fechada (antes do `open_time`)

### Estado (useShopSettings)
- Provê `isLunchPaused` e `isPreOpening`
- Atualiza via realtime (`postgres_changes` em `shop_settings`)

### Efeito no cliente
- Home: oculta horário estimado durante `isLunchPaused`
- QueueStatus: idem
- Novo entrante recebe webhook `JOINED_IN_LUNCH` ou `JOINED_IN_PRE_OPENING`

### Webhooks de transição
- `LUNCH_START` / `PRE_OPENING_START`: notifica todos ativos
- `LUNCH_END` / `PRE_OPENING_END`: notifica só `waiting`
- Após `LUNCH_END`: recálculo do tempo médio

---

## Estrutura de Arquivos

```
src/
├── lib/
│   ├── supabase.ts          # Cliente + tipos (Customer, QueueItem, Service, Schedule, etc.)
│   └── storage.ts           # getQueueId, setQueueSession, clearQueueSession (localStorage + cookies 8h)
├── hooks/
│   ├── useQueue.ts                  # useQueueCount, useEstimatedTime, useShopOpen, calculate*
│   ├── useQueueActions.ts           # start/complete/remove + normalizeQueuePositions
│   ├── useShopSettings.tsx          # context theme/shopName/logo/webhook/lunch/preOpening
│   └── useWebhookNotifications.ts   # NEXT, NEAR, UPDATE, DELAYED com flags/cooldowns
├── services/
│   └── webhookService.ts    # sendWebhook + testWebhook (todos eventos)
├── components/admin/
│   ├── AddCustomerForm.tsx          # Form admin com filtro de status na position
│   ├── AddCustomerModal.tsx         # Wrapper modal
│   ├── AdminHeader.tsx              # Botões almoço/pré-abertura/logout
│   ├── LoginScreen.tsx
│   ├── QueueItemCard.tsx            # Card individual + chips serviços + link parent
│   ├── QueueList.tsx                # Lista drag/drop
│   ├── RemoveConfirmModal.tsx
│   └── StatsCards.tsx
├── pages/
│   ├── Home.tsx                     # Entrar na fila com filtro de status na position
│   ├── QueueStatus.tsx              # Status + saída com convidados
│   ├── InService.tsx                # Tela em atendimento
│   ├── AdminDashboard.tsx           # Painel admin (toggle almoço/pré-abertura)
│   ├── AdminSettings.tsx
│   ├── AdminHistory.tsx
│   ├── AdminClients.tsx
│   └── AdminCampaigns.tsx
└── constants/
    └── constants.ts        # DDDs, weekdays, BARBER_SERVICES, ServiceId
```

---

## Campanhas de WhatsApp

`AdminCampaigns`:
- URL fixa: `https://n8ndes.ltech.app.br/webhook/campanha`
- Tabela única `campaigns` com `is_draft`
- Formatação: `**negrito**`, `*itálico*`

---

## Tipos Principais (supabase.ts)

```typescript
Customer { id, name, phone, created_at }

QueueItem {
  id, code, customer_id, position, status, created_at,
  service_start?, service_end?, customer?,
  service_duration?, parent_queue_id?, selected_services?,
  notified_near?, notified_next?,
  last_update_sent_at?, last_sent_eta?, last_delay_sent_at?
}

Campaign { id, title, message, is_draft, selected_contact_ids, recipient_count, created_at, updated_at }
Service { id, customer_id, duration_minutes, created_at }
Schedule { id, weekday, open_time, close_time, is_closed }
ScheduleException { id, date, open_time, close_time, is_closed }
ShopSettings {
  id, manual_status, whatsapp_number, theme, shop_name, logo_url,
  webhook_url?, tracking_url_base?, base_queue_time?, max_queue_time?,
  is_lunch_paused, is_pre_opening
}
```

---

## Decisões de Desenvolvimento

1. **Webhook position**: rank ativo (`queueCount + 1`), nunca campo DB `position`
2. **`position` reseta com fila vazia**: max calculado só entre `waiting`+`serving` (filtro `.in("status", […])` em `Home.tsx:232` e `AddCustomerForm.tsx:70`)
3. **Reset de notificações**: removido reset automático que causava re-envio indevido ao abrir dashboard
4. **Position no banco**: mantido para `order by` + drag/drop; rank sempre runtime
5. **Contagem inclui "serving"**: `useQueueCount()` conta `["waiting","serving"]`
6. **Tempo de serviço dinâmico**: soma de `queue.service_duration` por entrada (fallback 37min ou 30min)
7. **Arredondamento**: múltiplo de 5 min mais próximo (`roundToNearest5`)
8. **ETA formato único**: `"HH:mm"` — não mais intervalo
9. **ETA não duplica serving**: `remainingCurrent` separado de `waitingAhead`
10. **NEXT trigger**: `position === servingCount + 1` (topo da espera)
11. **Convidados via parent_queue_id**: relação no banco, sem localStorage
12. **Modo almoço/pré-abertura**: flags em `shop_settings`, webhooks dedicados (`*_START`, `*_END`, `JOINED_IN_*`)
13. **UPDATE não acompanha JOINED**: primeira observação seta `last_sent_eta` sem enviar webhook
14. **Almoço só com loja aberta; pré-abertura só em auto + loja fechada**
15. **Recalcula ETA após LUNCH_END**
16. **Schema**: todas tabelas em `supabase_schema.sql` — manter sincronizado

---

## Comandos Úteis

```bash
npm run lint        # ESLint
npm run build       # Build (verifica erros)
npm run typecheck   # TypeScript only
npx tsc --noEmit    # idem
```
