import { MARCA } from "@/lib/marca";
import { pad2 } from "./util";

/**
 * Cabeçalho e rodapé — o "chrome" que emoldura todo slide não sangrado.
 *
 * Os dois designs aprovados têm chrome estruturalmente incompatível, e não é
 * questão de cor: um é impresso (colchetes de corte, paginação em pontos,
 * "SWIPE"), o outro é interface (ícones de engajamento numa coluna, barra de
 * progresso, botão de avançar). Trocar só os tokens não converte um no outro.
 *
 * Por isso o chrome é uma escolha própria (`tokens.chrome`), resolvida por
 * formato: `tutorial` usa o editorial, `noticia` e `prompt` usam o social.
 *
 * O contrato da variante não muda — ela continua devolvendo só o corpo.
 */

export type ChromeKind = "editorial" | "social";

/*
 * A marca vem de `MARCA`, e não escrita aqui.
 *
 * Estas três linhas ficaram com o nome anterior depois da troca para
 * `usa.journal`, e não apareceram em nenhuma revisão porque o carrossel de
 * jornal desenha o próprio cabeçalho e não passa por aqui. O slide de
 * comparação passa: ele não é sangrado, usa este chrome, e sairia assinado com
 * o nome antigo no primeiro dia em que a estrutura pedisse uma comparação.
 */
const HANDLE = MARCA.instagramHandle;
const EDITORIAL_TAGLINE = `${MARCA.nome.toUpperCase()} &middot; EUA SEM RUÍDO`;

/**
 * Ícones em SVG inline. O design de origem usa a biblioteca Iconify por
 * `<script>`, que o renderer não executa — e uma dependência de rede a mais no
 * momento da captura é mais uma chance de o slide sair sem o ícone.
 */
const ICONES = {
  coracao:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21Z"/></svg>',
  balao:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c5 0 9 3.3 9 7.4 0 4.1-4 7.4-9 7.4a11 11 0 0 1-2.6-.3L4 20l1.3-3.4A7 7 0 0 1 3 10.4C3 6.3 7 3 12 3Z"/></svg>',
  compartilhar:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3 3 10.2l7 2.6 2.6 7L21 3Z"/></svg>',
  seta:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
} as const;

function pontos(slideIndex: number, total: number): string {
  const itens = Array.from(
    { length: total },
    (_, i) => `<span class="d${i + 1 === slideIndex ? " on" : ""}"></span>`,
  ).join("");
  return `<div class="c-dots">${itens}</div>`;
}

/** Colchetes de corte nos quatro cantos — a assinatura do design impresso. */
export function cantosEditorial(): string {
  return '<div class="c-corners"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>';
}

/*
 * Post de imagem única não promete o que não tem.
 *
 * `noticia` é capa só. Numa peça de um slide, "01 / 01", a barra de progresso
 * e o "SWIPE →" convidam para uma segunda tela que não existe: quem arrasta
 * não encontra nada, e o convite passa a ser ruído. É o mesmo raciocínio que
 * tirou os contadores de curtida do trilho — não imprimir na arte uma
 * interação que a peça não sustenta.
 *
 * A marca e a assinatura ficam: elas não prometem nada.
 */
export function chromeHeader(kind: ChromeKind, slideIndex: number, total: number): string {
  const paginacao = total > 1;

  if (kind === "social") {
    return `<div class="c-head social">
<span class="mark">${MARCA.nome}</span>
${paginacao ? `<span class="pill">${pad2(slideIndex)}<i>/</i>${pad2(total)}</span>` : ""}
</div>`;
  }

  return `<div class="c-head editorial">
<span class="handle">${HANDLE}</span>
${paginacao ? `<span class="count">${pad2(slideIndex)} / ${pad2(total)}</span>` : ""}
</div>`;
}

/**
 * Quanto o rodapé promete: a affordance cheia ou só a continuidade.
 *
 * `completa` é o design impresso original, com "SWIPE" escrito e a seta. É o
 * que o `tutorial` e o `prompt` usam desde sempre, e mexer nisso mudaria duas
 * superfícies que já estão no ar.
 *
 * `discreta` mantém a paginação e tira o convite escrito. É o que o conteúdo
 * permanente pede: o indicador de posição basta para o leitor saber que há
 * mais, e "SWIPE →" numa peça editorial de 2026 lê como banner.
 */
export type Affordance = "completa" | "discreta";

export function chromeFooter(
  kind: ChromeKind,
  slideIndex: number,
  total: number,
  affordance: Affordance = "completa",
): string {
  const avanco = total > 1;
  const convite = avanco && affordance === "completa";

  if (kind === "social") {
    return `<div class="c-foot social">
${avanco ? `<span class="prog"><b>PROGRESSO</b> ${pad2(slideIndex)} / ${pad2(total)}</span>` : `<span class="prog"><b>${HANDLE}</b></span>`}
${convite ? `<span class="next">${ICONES.seta}</span>` : ""}
</div>`;
  }

  return `<div class="c-foot editorial">
<span class="tag">${EDITORIAL_TAGLINE}</span>
${avanco ? pontos(slideIndex, total) : ""}
${convite ? `<span class="swipe">SWIPE ${ICONES.seta}</span>` : ""}
</div>`;
}

/**
 * Coluna de ícones do design social, **sem números**.
 *
 * O design de origem traz contadores ("2.797", "4.435"). São números de
 * maquete, e imprimi-los na arte publicaria prova social inventada: quem vê o
 * post leria como engajamento real. Os ícones ficam como motivo visual; o
 * engajamento verdadeiro é o do próprio Instagram, embaixo da imagem.
 */
export function trilhoEngajamento(): string {
  return `<div class="c-rail">
<span>${ICONES.coracao}</span>
<span>${ICONES.balao}</span>
<span>${ICONES.compartilhar}</span>
</div>`;
}
