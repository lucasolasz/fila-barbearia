# Contexto do Projeto - Agentes

## Visão Geral do Sistema

Sistema de fila para barbearia com gerenciamento via dashboard admin e check-in via app web.

---

## Tabelas do Banco de Dados

### 1. `customers`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `name` | Nome do cliente |
| `phone` | Telefone (único) |
| `created_at` | Data de criação |

---

### 2. `queue`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `customer_id` | Referência para cliente |
| `code` | Código de 4-5 caracteres (ex: "1CMI6") |
| `position` | **ID sequencial acumulativo** (100, 101, 102...). Usado para ordenação no banco. NÃO é a posição real na fila. |
| `status` | "waiting", "serving", "completed", "cancelled" |
| `created_at` | Data de entrada na fila |
| `service_start` | Timestamp início do atendimento |
| `service_end` | Timestamp fim do atendimento |
| `notified_next` | Flag para evitar re-envio de webhook NEXT |
| `notified_near` | Flag para evitar re-envio de webhook NEAR |
| `last_update_sent_at` | Timestamp do último webhook UPDATE |
| `last_sent_eta` | Último ETA enviado |
| `last_delay_sent_at` | Timestamp do último webhook DELAYED |

---

### 3. `services` (Histórico)

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `customer_id` | Referência para cliente |
| `duration_minutes` | Duração do serviço em minutos |
| `created_at` | Data de realização |

---

### 4. `barbershop_schedule`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `weekday` | Dia da semana (0-6, sendo 0 = domingo) |
| `open_time` | Horário de abertura |
| `close_time` | Horário de fechamento |
| `is_closed` | Se o dia está fechado |

---

### 5. `schedule_exceptions`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `date` | Data específica |
| `open_time` | Horário de abertura |
| `close_time` | Horário de fechamento |
| `is_closed` | Se está fechado |

---

### 6. `shop_settings`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `manual_status` | "auto", "open", "closed" |
| `whatsapp_number` | Número para contato |
| `theme` | "light" ou "dark" |
| `shop_name` | Nome da barbearia |
| `logo_url` | URL do logo |
| `webhook_url` | URL do webhook para n8n |
| `tracking_url_base` | URL base para rastreamento |
| `base_queue_time` | Tempo base por cliente (minutos) |
| `max_queue_time` | Hora máxima para entrar na fila |

---

## Posição na Fila — Contagem Inclui "serving"

**Regra fundamental**: A pessoa em atendimento (`status === "serving"`) é contada na posição da fila. Se alguém está sendo atendido, o próximo cliente na fila vê posição 2, não 1.

Isso afeta todos os cálculos de posição no sistema:

| Onde | Como calcula |
|------|-------------|
| `useQueueCount()` | Conta itens com `status in ["waiting", "serving"]`. Posição do novo cliente = `queueCount + 1` |
| `QueueStatus.calculatePosition()` | Conta itens com `status in ["waiting", "serving"]` e `position < currentPosition`, depois `+1` |
| `AdminDashboard` webhooks | `position = servingCount + waitingIndex + 1`, `peopleAhead = position - 1` |
| `AdminDashboard` NEXT trigger | Dispara quando `position === servingCount + 1` (topo da fila de espera) |
| `AdminDashboard` handleSaveOrder | Posições de "waiting" começam em `servingCount + 1` |
| `normalizeQueuePositions()` | Serving items recebem as primeiras posições, waiting items em seguida |

---

## Webhooks

O sistema envia webhooks para integração externa (ex: n8n). Tipos de evento:

| Evento | Quando é enviado |
|--------|-------------------|
| `JOINED` | Cliente entra na fila (Home/Join/AdminDashboard) |
| `NEXT` | Cliente chega no topo da fila de espera (`peopleAhead === servingCount`) |
| `NEAR` | Cliente está próximo (`peopleAhead <= 2`) |
| `UPDATE` | Posição muda e ETA muda >= 10min (com cooldown de 5min) |
| `DELAYED` | Atendimento atual está com atraso (a cada 10min de delay após 37min) |

**Importante**: O `position` enviado no webhook deve ser a **posição real na fila** (1, 2, 3...), não o ID sequencial do banco. A posição real inclui quem está sendo atendido.

---

## Tempo Estimado de Serviço — Fixo em 37 minutos

**Decisão**: O tempo médio de serviço é **fixo em 37 minutos**. Não é mais calculado dinamicamente a partir do histórico de `services`.

Isso simplifica cálculos e garante previsibilidade. As funções afetadas:

| Função | Comportamento |
|--------|--------------|
| `calculateEstimatedServiceTimeDynamic()` | Usa `avg = 37`. Não consulta mais a tabela `services` |
| `calculateEstimatedMinutes()` | Usa `avg = 37`. Não consulta mais a tabela `services` |
| `useAverageServiceTime()` | Retorna `37` fixo. Não consulta mais a tabela `services` |
| `calculateEstimatedServiceTime()` | Fallback estático com intervalo 25-40min por pessoa |

### Arredondamento do Horário Estimado

O horário estimado é arredondado para o **múltiplo de 15 minutos mais próximo** (não mais pra cima). Exemplo: 9:47 → 9:45 (antes era 10:00).

---

## ETA — Não Contabilizar em Dobro o "serving"

Ao calcular o ETA, o tempo do cliente em atendimento é calculado separadamente (`remainingCurrent`) e as pessoas na frente excluem quem já está sendo atendido:

```typescript
const waitingAhead = Math.max(0, posicaoNaFila - 1 - servingCount);
const shiftByMinutes = waitingAhead * avg;
// totalMin = remainingCurrent + waitingAhead * avg
```

Para posição 1 (próximo a ser atendido), o ETA considera apenas o tempo restante do atendimento atual, não soma um tempo completo extra.

---

## Campos `position` vs Posição Real

O campo `position` no banco é usado para:
- Ordenação no Supabase (`order("position", { ascending: true })`)
- Eficiência em queries (`.lt("position", x)` mais rápido que datas)
- Persistência de ordem se houver reorder manual

**A posição real na fila é sempre calculada em runtime**, nunca lida diretamente do campo `position` do banco.

Cálculo da posição real:
- Na Home/Join: `queueCount + 1` (onde `queueCount` inclui "waiting" e "serving")
- No QueueStatus: contagem de itens com status "waiting" ou "serving" e `position < currentPosition`, +1
- No AdminDashboard: `servingCount + waitingIndex + 1`

---

## AdminDashboard — Lógica de Notificações

O AdminDashboard processa webhooks em tempo real para notificar clientes. Fluxo:

1. Carrega todos os itens com status "waiting" ou "serving"
2. Calcula posição real como `servingCount + waitingIndex + 1`
3. Verifica flags `notified_next` e `notified_near` do banco
4. Se conditions atendidas e flags false → envia webhook

**Importante**: Não fazer reset automático das flags baseado apenas no `peopleAhead`. O reset só deve ocorrer em reorder manual (drag and drop).

---

## AdminDashboard — Exibição no Card do Cliente

Para cada item na fila, o card exibe:
- Código, nome e telefone do cliente
- **Horário de entrada na fila** (`created_at`) com segundos: `DD/MM/AA, HH:mm:ss`
- **Horário de início do atendimento** (`service_start`) para itens com `status === "serving"`: `"Iniciou: HH:mm:ss"` em verde

---

## Decisões de Desenvolvimento

1. **Webhook position**: Alterado de ID sequencial para posição real (`queueCount + 1` em Home/Join, `servingCount + waitingIndex + 1` no AdminDashboard)
2. **AddCustomerForm webhook bug corrigido**: Envia `queueCount + 1` em vez de `nextPos` (ID sequencial do banco)
3. **Reset de notificações**: Removido reset automático que causava re-envio indevido ao abrir dashboard
4. **Position no banco**: Mantido para ordenação e eficiência
5. **Contagem inclui "serving"**: `useQueueCount()` conta `["waiting", "serving"]`, não apenas `"waiting"`
6. **Tempo de serviço fixo**: 37 minutos, sem consulta à tabela `services`
7. **Arredondamento de horário**: Múltiplo de 15min mais próximo (não sempre pra cima)
8. **ETA não duplica serving**: Tempo restante do atendimento atual é separado de `waitingAhead`
9. **NEXT trigger**: Dispara quando `position === servingCount + 1` (topo da fila de espera)
10. **Schema**: Todas as tabelas documentadas conforme supabase_schema.sql

---

## Estrutura de Arquivos

```
src/
├── lib/
│   └── supabase.ts          # Cliente Supabase e tipos (Customer, QueueItem, Service, Schedule, ScheduleException, ShopSettings)
├── hooks/
│   ├── useQueue.ts         # Hooks de fila (contagem, tempo estimado, status da loja)
│   └── useShopSettings.tsx # Configurações da loja (theme, shopName, logoUrl, etc)
├── services/
│   └── webhookService.ts   # Serviço de webhooks (JOINED, NEAR, NEXT, UPDATE, DELAYED)
├── pages/
│   ├── Home.tsx            # Entrar na fila
│   ├── Join.tsx            # Entrar via código (alternativo)
│   ├── QueueStatus.tsx     # Ver status na fila
│   ├── InService.tsx       # Tela quando cliente está em atendimento
│   ├── AdminDashboard.tsx  # Painel admin (fila, notificações, controle)
│   ├── AdminSettings.tsx   # Configurações da barbearia
│   ├── AdminHistory.tsx    # Histórico de atendimentos
│   └── AdminCampaigns.tsx  # Campanhas de WhatsApp
└── constants/
    └── constants.ts        # DDDs, weekdays
```

---

## Campanhas de WhatsApp

O AdminCampaigns envia campanhas para um webhook fixo:
- URL: `https://n8ndes.ltech.app.br/webhook/campanha`
- Tabelas: `campaigns` (campanhas enviadas) e `campaign_drafts` (rascunhos)
- Formatação: `**texto**` = negrito, `*texto*` = itálico

---

## Tipos Principais (supabase.ts)

```typescript
Customer { id, name, phone, created_at }
QueueItem { id, code, customer_id, position, status, created_at, service_start, service_end, customer?, notified_near?, notified_next?, last_update_sent_at?, last_sent_eta?, last_delay_sent_at? }
Service { id, customer_id, duration_minutes, created_at }
Schedule { id, weekday, open_time, close_time, is_closed }
ScheduleException { id, date, open_time, close_time, is_closed }
ShopSettings { id, manual_status, whatsapp_number, theme, shop_name, logo_url, webhook_url?, tracking_url_base?, base_queue_time?, max_queue_time? }
```

---

## Comandos Úteis

```bash
# Verificar lint
npm run lint

# Verificar build
npm run build

# Verificar erros TypeScript
npm run typecheck
```