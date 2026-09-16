/**
 * Renderiza o recorte de post, para olhar antes de publicar.
 *
 * Mesma razão do preview do jornal: as correções que este desenho vai pedir
 * não aparecem em teste nenhum. Altura do bloco que encolhe, colisão da mídia
 * com o segundo parágrafo e peso do negrito só aparecem na imagem.
 *
 * Uso: npx tsx src/scripts/preview-recorte.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import type { InstagramSlide } from "@/lib/carousel-templates/types";

const SAIDA = "/private/tmp/claude-501/-Users-lucastoledo-Applications-AI-Projects-Claude/381cd9c6-282d-49ea-b3b1-f4e1c8385248/scratchpad/recorte";
fs.mkdirSync(SAIDA, { recursive: true });

// Foto real e da pauta, pela mesma regra do preview do jornal: preview com
// foto genérica ensina a olhar a tipografia e a ignorar o que mais importa.
const FOTO =
  "https://upload.wikimedia.org/wikipedia/commons/8/8d/Marriner_S._Eccles_Federal_Reserve_Board_Building.jpg";

const peças: Array<{ nome: string; slide: Partial<InstagramSlide>; tipo: string; variante: string; total: number; indice: number }> = [
  {
    nome: "1-capa-recorte",
    tipo: "cover",
    variante: "recorte_post",
    total: 5,
    indice: 1,
    slide: {
      eyebrow: "Fed",
      title:
        "o Federal Reserve cortou os juros nesta quarta e sinalizou mais dois cortes até o fim do ano.",
      bg_image_url: FOTO,
      body:
        "Quem acha que isso é só assunto de mercado não entendeu o tamanho da mudança. O dólar, a passagem e a prestação da casa nos EUA respondem a essa taxa:",
    },
  },
  {
    // O caso curto: pouco texto e a mídia. É onde o ajuste tende a inflar a
    // tipografia e quebrar a semelhança com a referência.
    nome: "2-capa-texto-curto",
    tipo: "cover",
    variante: "recorte_post",
    total: 4,
    indice: 1,
    slide: {
      eyebrow: "Black Friday",
      title: "as lojas americanas começaram as ofertas três semanas antes da data.",
      bg_image_url: FOTO,
      body: "O desconto de novembro já está na vitrine de outubro:",
    },
  },
  {
    // O teto REAL: 196 caracteres somados, contra o orçamento de 200. É o
    // limite que a peça aceita com foto, e o que passar disso sai de jornal.
    nome: "3-capa-no-teto-do-orcamento",
    tipo: "cover",
    variante: "recorte_post",
    total: 6,
    indice: 1,
    slide: {
      eyebrow: "Custo de vida",
      title: "o aluguel nos EUA subiu pelo quinto mês seguido, e a alta se concentra em Orlando e Miami.",
      bg_image_url: FOTO,
      body:
        "A conta de morar pesa mais que a de comer para quem chegou agora. É a que menos aparece no número:",
    },
  },
  {
    // Sem foto: a peça vira texto puro, e precisa continuar de pé.
    nome: "4-sem-foto",
    tipo: "cover",
    variante: "recorte_post",
    total: 3,
    indice: 1,
    slide: {
      eyebrow: "Emprego",
      title: "os Estados Unidos criaram 119 mil vagas em agosto, acima do que o mercado esperava.",
      body:
        "O número forte tira pressão do Fed para cortar juros de novo. Para quem ganha em dólar e manda dinheiro para o Brasil, isso mexe no câmbio antes de mexer em qualquer outra coisa:",
    },
  },
  {
    // Miolo: mesma gramática, sem o convite de arrastar e com a marca no pé.
    nome: "5-miolo",
    tipo: "content",
    variante: "miolo_recorte",
    total: 5,
    indice: 3,
    slide: {
      eyebrow: "O que muda no seu bolso",
      title: "a taxa do financiamento imobiliário acompanha a decisão do Fed com algumas semanas de atraso.",
      body:
        "Quem está pesquisando casa agora tende a ver proposta melhor em novembro. O banco não repassa o corte no mesmo dia, e é por isso que a pressa costuma custar caro:",
    },
  },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: DEFAULT_TOKENS.canvas.width, height: DEFAULT_TOKENS.canvas.height },
    deviceScaleFactor: 1,
  });

  for (const p of peças) {
    const html = assembleSlide(
      { index: p.indice, type: p.tipo, body: "", bullet_points: [], ...p.slide } as InstagramSlide,
      {
        format: "noticia",
        tokens: DEFAULT_TOKENS,
        formatConfig: { variantBySlideType: { [p.tipo]: p.variante }, eyebrowLabel: null, ctaText: null },
        slideIndex: p.indice,
        total: p.total,
        molduraDiscreta: true,
      },
    );

    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForFunction('document.documentElement.getAttribute("data-ajuste-pronto") === "1"', { timeout: 8000 }).catch(() => {});
    await page.screenshot({ path: `${SAIDA}/${p.nome}.png` });
    console.log(`  ${p.nome}.png`);
  }

  await browser.close();
  console.log(`\npeças em ${SAIDA}`);
}

main();
