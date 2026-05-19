# fila-barbearia — Claude Code Context

Leia `AGENTS.md` para documentação completa do projeto (schema, fluxos, webhooks, decisões).

## Regras críticas (resumo rápido)

- **`queue.position`** é sequência monotônica — para rank ativo use `useQueueCount()` (`waiting | serving`)
- **Webhook**: `position = queueCount + 1`, `peopleAhead = queueCount` — nunca `nextPosition`
- **ETA**: `calculateEstimatedServiceTimeDynamic()` soma `service_duration` real por entrada; retorna `"HH:mm"` arredondado para múltiplo de 5 min
- **Persistência**: nunca localStorage isolado para dados entre sessões — usar DB (FK) ou cookies
- **Schema**: toda migration = atualizar `supabase_schema.sql` + tipo em `supabase.ts` + lembrar usuário de rodar SQL no Supabase

## Build
```bash
npm run build      # verifica erros
npx tsc --noEmit   # só TypeScript
```
