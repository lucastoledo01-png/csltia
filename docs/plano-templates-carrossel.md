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

### 4. Fontes viram conjunto fechado

**A `Bespoke Serif` do design nunca carregou.** O `<link>` do draft a pede ao
Google Fonts, que não a serve — verificado buscando a URL, que devolve só
Epilogue. E confirmado com `document.fonts` no preview do próprio Superdesign:
as únicas famílias carregadas são Epilogue e General Sans. A serifa itálica
elegante que aparece no design é o **Times do sistema**.

Num container headless do Playwright isso seria pior e igualmente silencioso —
pode não haver serifa instalada.

`fonts.ts` fecha essa porta: a família e a especificação que a carrega ficam no
mesmo registro, os tokens escolhem por chave, e o `<link>` é derivado das
chaves. Declarar uma fonte sem requisitá-la deixa de ser possível de escrever.
O itálico de destaque passa a ser **Playfair Display**, que está no Google
Fonts e já é caminho comprovado neste renderer.

## Proporção: 1080×1440

Adotada a dos designs (3:4), contra os 1080×1350 (4:5) que o renderer usava.
Agora é o token `canvas`, e o viewport do Playwright é derivado dele — antes
eram dois números independentes, e mudar um sem o outro renderizaria certo no
preview e cortado no post publicado.

**As variantes antigas ainda estão calibradas para 1350.** Elas continuam
montando sem erro, mas o espaçamento sobra: os 90px a mais aparecem como folga
no rodapé. Só some quando cada uma for substituída pelas variantes dos designs
aprovados, nas fases C e D. Se a proporção estiver errada, é um token.

## Ordem de execução

| Fase | O quê | Resultado |
|---|---|---|
| **A** ✅ | Tokens por formato, conjunto fechado de fontes, tela 1080×1440 | Destrava o resto; nada muda visualmente ainda |
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
