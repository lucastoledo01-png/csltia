# Plano: os três formatos ganham design definitivo

Dois designs fechados no Superdesign viram as variantes travadas dos três
formatos. É o caminho que `estado-do-ecossistema.md` já tinha apontado como o
robusto: você desenha, eu converto uma vez, e daí em diante o sistema só
preenche texto em campos fixos — nunca rearranja layout.

| Formato | Design | Origem |
|---|---|---|
| `tutorial` | Claro / editorial impresso | draft `ac015490-…` |
| `noticia` | Escuro / editorial com foto | draft `ec0f02b2-…` |
| `prompt` | Escuro / editorial com foto | draft `ec0f02b2-…` |

Os drafts são públicos em `https://p.superdesign.dev/draft/<id>` e foram
baixados com `curl` — não é preciso o CLI nem login.

## Os dois sistemas visuais

**Claro (tutorial).** Fundo `#F5F1ED`, tinta `#1A1A1A`, terracota `#C85A2F`.
General Sans para texto, Bespoke Serif **itálico** para a palavra de destaque,
Epilogue nos pesos display. Chrome: colchetes nos quatro cantos, `@handle` e
`01 / 05` no topo, paginação em pontos e `SWIPE →` no rodapé.

**Escuro (notícia e prompt).** Fundo `#080808`/`#0F0F0F`, coral `#FF7B72`,
branco. Foto sangrada com gradiente, manchete Epilogue pesada com uma palavra
em Bespoke Serif itálico coral. Chrome: wordmark no topo, coluna de ícones de
engajamento à direita, `PROGRESSO 01 / 05` e botão de seta no rodapé.

## Quatro decisões de arquitetura

### 1. Tokens passam a ser por formato

Hoje `carousel_theme` é **linha única** (`id = 1`): um tema global para os três
formatos. Dois designs opostos — um claro, um escuro — não cabem nele. Um
`--s-bg` só não pode ser `#F5F1ED` e `#080808` ao mesmo tempo.

`carousel_format_config` já é por formato, mas guarda apenas
`variant_by_slide_type`, `eyebrow_label` e `cta_text`. Ganha uma coluna
`tokens jsonb` de override, resolvida em cascata:

```
default do repo  →  carousel_theme (global)  →  carousel_format_config.tokens
```

Migração aditiva; formato sem override continua caindo no tema global, e o
botão "restaurar padrão" do painel continua sendo apagar a chave.

### 2. O chrome vira parte da variante, não do shell

`shell.ts` hoje desenha um cabeçalho e um rodapé únicos. Os dois designs têm
chrome incompatível entre si: colchetes e pontos de um lado, ícones de
engajamento e barra de progresso do outro.

`renderShell` passa a receber o formato e delegar a um `chrome` por sistema
visual — `chromeClaro` e `chromeEscuro`. O contrato da variante
(`VariantOutput` com `body`, `full`, `onDark`) não muda: continua devolvendo só
o corpo.

### 3. Tailwind e Iconify não entram

Os drafts vêm com `cdn.tailwindcss.com` e `iconify-icon` via `<script>`. O
renderer monta o próprio CSS em `base-css.ts` e não executa Tailwind. As
utilitárias viram CSS explícito, e os ícones viram SVG inline.

Não é perda: CSS explícito é o que torna a variante **travada**. Utilitária
solta no HTML é um convite a alguém rearranjar layout por post, que é
exatamente o que não pode acontecer.

### 4. Fontes precisam de origem confiável

O renderer é Playwright headless: fonte que não carrega vira fallback silencioso
e o slide sai errado sem erro. Epilogue e Bespoke Serif estão no Google Fonts.
General Sans vem de `fonts.cdnfonts.com` no draft — terceiro sem garantia.

Duas saídas, e a segunda é a certa: trocar General Sans por Epilogue nos pesos
de texto (já carregada, desenho compatível), ou **auto-hospedar** os `.woff2`
em `public/fonts/`. Auto-hospedar elimina a dependência de rede no momento da
renderização — e o renderer já tem histórico de falha silenciosa.

## Uma pergunta que precisa de resposta antes

**1080×1440 ou 1080×1350?** Os designs são 1440 (3:4); o renderer e o
`deviceScaleFactor: 2` de `opendesign-renderer.ts` estão em 1350 (4:5). São
proporções diferentes, e a diferença aparece no corte do feed.

Não vou adivinhar o que o Instagram aceita hoje sem confirmar. Se a resposta for
1440, muda `base-css.ts`, o viewport do Playwright e as alturas de todas as
variantes existentes — as antigas precisam ser reavaliadas na proporção nova, ou
aposentadas junto.

## Ordem de execução

| Fase | O quê | Resultado |
|---|---|---|
| **A** | Tokens por formato (migração + `resolve.ts`) e fontes auto-hospedadas | Destrava o resto; nada muda visualmente ainda |
| **B** | Chrome por sistema visual em `shell.ts` | Os dois chromes existem, ainda com as variantes antigas |
| **C** | Variantes do design claro para os slides de `tutorial` | Tutorial sai no design definitivo |
| **D** | Variantes do design escuro para `noticia` e `prompt` | Os três formatos fechados |
| **E** | Aposentar as variantes rascunho e ajustar `format-defaults.ts` | Só os designs aprovados sobram |

Cada fase termina com preview no painel (aba **Carrossel**) e um teste de
`assemble` — o arquivo `assemble.test.ts` já cobre o encaixe, e ganha um caso
por variante nova.

## Os dez tipos de slide precisam de cobertura

A IA produz `cover`, `intro`, `content`, `quote_highlight`, `practical_impact`,
`cta`, `step`, `tip`, `gallery` e `personalization`. Os drafts têm cinco slides
cada — cobrem capa, corpo e CTA, não os dez tipos.

Para os tipos sem correspondência no design (`gallery`, `personalization`,
`quote_highlight`), há duas saídas: derivar do slide de corpo mantendo o mesmo
sistema visual, ou restringir o vocabulário da IA por formato para que ela nunca
produza um tipo sem variante. A segunda é mais previsível e é a recomendada —
um tipo sem variante hoje cai num fallback que ninguém desenhou.
