# Casaloti

Portal brasileiro de IA com radar de novidades, prompts de bolso, artigos AEO e base para área de membros.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Vitest + Testing Library
- Futuro: Supabase, Asaas e SendPulse

## Scripts

```bash
npm run dev
npm run lint
npm test
npm run build
```

## Segurança

- Nunca commitar `.env`.
- Usar `.env.example` para documentar variáveis sem valores reais.
- Segredos de Asaas, Supabase e SendPulse ficam somente no ambiente de deploy/local.
- Obsidian/MegaBrain guarda estratégia, não credenciais nem dados de usuários.

## Observação Next.js 16

O scaffold gerou um `AGENTS.md` avisando que esta versão pode ter mudanças de API. O caminho citado (`node_modules/next/dist/docs`) não veio no pacote instalado, então a validação prática inicial será feita por TypeScript, lint, testes e build.
