# Pipeline de Carrossel de Instagram — desbuguei.ia

Este documento descreve a arquitetura, pipeline e funcionamento do novo módulo de backend para transformação automática das edições diárias da **desbuguei.ia** em carrosséis para Instagram.

---

## 🏛️ 1. Visão Geral da Arquitetura

O módulo reaproveita 100% da inteligência editorial e factual já produzida pelo sistema (`newsroom-service.ts` e `EditionContent`). 

```
Edição Diária Pronta (EditionContent)
          │
          ├──► Portal Web (/artigos/[slug])
          ├──► Newsletter (Listmonk)
          └──► Módulo Instagram (/lib/server/social/instagram)
                  │
                  ├── 1. Seleção da pauta principal / síntese
                  ├── 2. OpenAI GPT (Adaptação para formato Instagram)
                  ├── 3. Zod Schema Validation (InstagramCarouselContent)
                  ├── 4. Geração de Legenda (Caption + Hashtags)
                  └── 5. Persistência em `social_posts` (Dry Run / Preview)
```

---

## 🎨 2. Identidade Editorial & Tom da Marca Desbuguei

- **Público**: Criadores de conteúdo, gestores de mídias sociais, empreendedores e profissionais de vendas.
- **Tom**: Direto, moderno, leve, inteligente e tech.
- **Jargões de Branding**: Uso sutil e moderado de termos como *desbugar, modo debug, update, patch, hotfix, sem stack trace*.
- **Estrutura do Carrossel**:
  - Slide 1: **Cover** (Eyebrow + Título Magnético + Subtítulo + Prompt para Hero Image 3D).
  - Slide 2: **Intro** (O fato direto em 2 frases).
  - Slide 3-6: **Content / Practical Impact** (Pontos chave + Bloco de aplicação prática nas redes/vendas).
  - Slide Final: **CTA** (Chamada para salvar, compartilhar no story e seguir a @desbuguei.ia).

---

## 🔒 3. Flags de Segurança & Dry Run

- `INSTAGRAM_DRY_RUN`: Quando `true` (padrão inicial na Fase 1), gera o roteiro, valida o JSON, calcula métricas e salva no banco de dados **sem publicar** nada externamente.
- `INSTAGRAM_AUTO_POST`: Quando `false` (padrão inicial), bloqueia qualquer disparo automático até que haja aprovação manual no painel admin.

---

## 🛠️ 4. Como Executar (Cli e API)

### Execução via CLI:
```bash
npx tsx src/scripts/generate-instagram-carousel.ts
```

### Execução via API Interna (Protegida):
```http
POST /api/admin/social/instagram/generate
Content-Type: application/json
Authorization: Bearer <ADMIN_SECRET>

{
  "dryRun": true,
  "editionDateStr": "2026-08-25"
}
```

---

## 📊 5. Estrutura de Banco de Dados (`social_posts`)

As postagens geradas são registradas na tabela `public.social_posts` no Supabase contendo:
- `id`: UUID único.
- `edition_date`: Data da edição original.
- `title`: Título do carrossel.
- `caption`: Legenda formatada para colar no Instagram.
- `content_json`: Manifest estruturado completo dos slides.
- `status`: `'draft'`, `'generated'`, `'approved'`, `'scheduled'`, `'published'`, `'failed'`.
- `idempotency_key`: Previne gerações duplicadas (`instagram-carousel-YYYY-MM-DD`).
