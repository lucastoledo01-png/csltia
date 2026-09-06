import { describe, expect, it } from "vitest";
import { BASE_CSS } from "./base-css";
import { CSS_DO_LAYOUT } from "./layout-render";
import { assembleSlide, resolveFormatConfig } from "./assemble";
import { DEFAULT_TOKENS } from "./tokens";
import { SLIDE_VARIANTS } from "./variants";
import { CAROUSEL_FORMATS } from "./types";
import type { InstagramSlide, InstagramSlideType } from "./types";

/**
 * Toda classe que a arte emite tem regra de CSS.
 *
 * Isto existe por um bug que ficou meses no ar sem sintoma de erro. Ao trocar
 * o chrome por um sistema novo, a remoção levou os SELETORES de `.s-header`,
 * `.s-brand`, `.s-badge`, `.s-wordmark` e `.s-counter` e deixou as chaves para
 * trás: sobraram dois blocos de declarações órfãs, que o parser de CSS pula em
 * silêncio. `overlayBrand()` continuou emitindo essas classes, e a capa com
 * foto, que é a peça publicada, passou a renderizar a marca como texto cru.
 *
 * Nada quebrou, nada avisou, e nenhum teste pegou: o HTML continuava correto,
 * o PNG continuava saindo. O defeito só aparecia olhando a arte.
 *
 * O teste é grosseiro de propósito. Ele não valida estilo, valida existência:
 * se uma variante emite uma classe, a folha precisa mencioná-la em algum
 * seletor. Classe emitida sem regra é ou lixo para apagar, ou estilo perdido.
 */

const FOLHA = `${BASE_CSS}${CSS_DO_LAYOUT}`;

/** Classes que existem só como gancho semântico, sem estilo próprio. */
const SEM_ESTILO_POR_DECISAO = new Set(["slide", "on-dark"]);

function classesDo(html: string): string[] {
  const achadas = new Set<string>();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (c) achadas.add(c);
    }
  }
  return [...achadas];
}

function slideDe(type: InstagramSlideType, variant: string): InstagramSlide {
  return {
    index: 1,
    type,
    eyebrow: "DECISÃO JUDICIAL",
    title: "Ordem manda USCIS retomar pedidos pendentes",
    body: "Um parágrafo de apoio que existe para a variante ter o que renderizar.",
    bullet_points: ["Primeiro item", "Segundo item", "Terceiro item"],
    highlight_text: "Um destaque",
    variant,
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "https://exemplo/foto.jpg",
    cta_text: "Comente VISA",
  };
}

describe("toda classe emitida tem regra", () => {
  const casos: Array<{ nome: string; html: string }> = [];

  for (const format of CAROUSEL_FORMATS) {
    for (const [type, variantes] of Object.entries(SLIDE_VARIANTS)) {
      for (const chave of Object.keys(variantes)) {
        casos.push({
          nome: `${format}/${type}/${chave}`,
          html: assembleSlide(slideDe(type as InstagramSlideType, chave), {
            format,
            tokens: DEFAULT_TOKENS,
            formatConfig: resolveFormatConfig(format),
            slideIndex: 1,
            total: 3,
            layout: null,
            credito: "Foto: Fulano / Wikimedia Commons, CC BY-SA 3.0",
          }),
        });
      }
    }
  }

  it("cobre todas as variantes existentes", () => {
    expect(casos.length).toBeGreaterThan(10);
  });

  for (const caso of casos) {
    it(`${caso.nome}`, () => {
      const orfas = classesDo(caso.html)
        .filter((c) => !SEM_ESTILO_POR_DECISAO.has(c))
        .filter((c) => !FOLHA.includes(`.${c}`));

      expect(orfas, `classes sem regra em ${caso.nome}`).toEqual([]);
    });
  }
});

describe("a folha não tem bloco órfão", () => {
  it("nenhuma declaração solta fora de um seletor", () => {
    /*
     * Um bloco órfão é uma linha que termina em `}` sem que nada antes dela
     * tenha aberto um `{`. É exatamente a assinatura do bug: o seletor foi
     * apagado e o corpo ficou.
     */
    const orfas: string[] = [];
    let profundidade = 0;
    for (const linha of FOLHA.split("\n")) {
      const abre = (linha.match(/\{/g) ?? []).length;
      const fecha = (linha.match(/\}/g) ?? []).length;
      if (profundidade === 0 && fecha > abre) orfas.push(linha.trim());
      profundidade = Math.max(0, profundidade + abre - fecha);
    }
    expect(orfas).toEqual([]);
  });

  it("nenhuma referência a token de fonte que não existe", () => {
    // `var(--f-body)` em vez de `var(--s-font-body)` cai no sans do sistema
    // sem erro nenhum. Os tokens de fonte são quatro e todos têm prefixo.
    const usados = [...FOLHA.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    const suspeitos = usados.filter((t) => /^--f-/.test(t));
    expect([...new Set(suspeitos)]).toEqual([]);
  });
});
