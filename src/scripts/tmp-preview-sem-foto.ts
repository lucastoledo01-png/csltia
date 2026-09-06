/* TEMPORARIO: preview da variante noticia_sem_foto. Apagar depois. */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { renderShell } from "@/lib/carousel-templates/shell";
import { esc } from "@/lib/carousel-templates/util";
import { mergeTokens } from "@/lib/carousel-templates/tokens";
import type {
  InstagramSlide,
  SlideVariant,
  VariantContext,
  VariantOutput,
} from "@/lib/carousel-templates/types";

const CSS_NOVO = `
.n-doc{flex:1;display:flex;flex-direction:column;position:relative;z-index:2;}
.n-band{display:flex;align-items:center;gap:24px;border-top:3px solid var(--s-ink);padding-top:22px;}
.n-band .lbl{font-family:var(--s-font-mono);font-size:20px;font-weight:700;letter-spacing:3.4px;
  text-transform:uppercase;color:var(--s-accent);white-space:nowrap;}
.n-band .fio{flex:1;height:1px;background:var(--s-border);}
.n-manchete{margin:auto 0;font-family:var(--s-font-display);font-weight:800;letter-spacing:-0.03em;
  line-height:1.05;color:var(--s-ink);text-wrap:normal;overflow-wrap:break-word;}
.n-fecho{width:132px;height:6px;background:var(--s-accent);}
`;

const ESTREITOS = "ijltfr.,;:!|()[]/-'’\"";
const LARGOS = "mwMW";

function larguraEm(texto: string): number {
  let em = 0;
  for (const ch of texto) {
    if (ch === " ") em += 0.26;
    else if (LARGOS.includes(ch)) em += 0.85;
    else if (ESTREITOS.includes(ch)) em += 0.3;
    else if (ch === "I") em += 0.32;
    else if (ch >= "0" && ch <= "9") em += 0.58;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += 0.62;
    else em += 0.55;
  }
  return em;
}

function linhasDaManchete(palavras: number[], colunaEm: number): number {
  let linhas = 1;
  let atual = 0;
  for (const largura of palavras) {
    const proposta = atual === 0 ? largura : atual + 0.26 + largura;
    if (proposta > colunaEm && atual > 0) {
      linhas += 1;
      atual = largura;
    } else {
      atual = proposta;
    }
  }
  return linhas;
}

const ESCALA_DA_MANCHETE = [3.6, 3.3, 3.0, 2.75, 2.5, 2.3, 2.1, 1.9, 1.74, 1.58, 1.44, 1.31, 1.19, 1.08, 0.98, 0.9];

function corpoDaManchete(titulo: string, ctx: VariantContext): number {
  const { canvas, type } = ctx.tokens;
  const palavras = titulo.trim().split(/\s+/).filter(Boolean).map(larguraEm);
  const coluna = (canvas.width - 160) * 0.96;
  const mancha = (canvas.height - 160 - 130) * 0.72;
  const maior = palavras.reduce((m, l) => Math.max(m, l), 0);
  const piso = Math.round(type.displayLg * ESCALA_DA_MANCHETE[ESCALA_DA_MANCHETE.length - 1]);

  for (const fator of ESCALA_DA_MANCHETE) {
    const corpo = Math.round(type.displayLg * fator);
    if (maior * corpo > coluna) continue;
    if (linhasDaManchete(palavras, coluna / corpo) * corpo * 1.05 <= mancha) return corpo;
  }
  return piso;
}

const coverNoticiaSemFoto: SlideVariant = {
  key: "noticia_sem_foto",
  label: "Notícia sem foto: registro tipográfico",
  render: (slide, ctx): VariantOutput => {
    const rotulo = (slide.eyebrow ?? "").trim();
    const manchete = (slide.title ?? "").trim();

    return {
      body: `
<div class="n-doc">
  <div class="n-band">${rotulo ? `<span class="lbl">${esc(rotulo)}</span>` : ""}<i class="fio"></i></div>
  <div class="n-manchete" style="font-size:${corpoDaManchete(manchete, ctx)}px">${esc(manchete)}</div>
  <div class="n-fecho"></div>
</div>`,
    };
  },
};

const casos: Array<{ nome: string; titulo: string; eyebrow: string; chrome: "editorial" | "social"; h?: number }> = [
  { nome: "01-curto", titulo: "Corte suspende regra do H-1B", eyebrow: "DECISÃO JUDICIAL", chrome: "editorial" },
  { nome: "02-medio", titulo: "USCIS retoma análise de pedidos de green card parados desde julho", eyebrow: "PROCESSO", chrome: "editorial" },
  { nome: "03-longo", titulo: "Departamento de Estado amplia a lista de consulados que voltam a agendar entrevistas de visto de turista ainda neste mês", eyebrow: "PROCESSO", chrome: "editorial" },
  { nome: "04-sem-rotulo", titulo: "Nova taxa consular entra em vigor", eyebrow: "", chrome: "editorial" },
  { nome: "05-longo-sem-rotulo", titulo: "Regulamentação do parole humanitário para venezuelanos é suspensa por tribunal federal em Nova Orleans nesta sexta", eyebrow: "", chrome: "editorial" },
  { nome: "06-social", titulo: "USCIS retoma análise de pedidos de green card parados desde julho", eyebrow: "CUSTO DE VIDA", chrome: "social" },
  { nome: "07-palavra-longa", titulo: "Juiz aponta inconstitucionalidade na regra", eyebrow: "DECISÃO JUDICIAL", chrome: "editorial" },
  { nome: "08-muito-curto", titulo: "Supremo derruba liminar", eyebrow: "DECISÃO JUDICIAL", chrome: "editorial" },
  { nome: "09-canvas-1440", titulo: "Governo dos EUA anuncia mudança no processo de renovação de vistos H-1B e L-1 para brasileiros", eyebrow: "PROCESSO", chrome: "editorial", h: 1440 },
];

const saida = process.argv[2] ?? ".";
const browser = await chromium.launch({ headless: true });

for (const caso of casos) {
  const altura = caso.h ?? 1350;
  const tokens = mergeTokens({ canvas: { width: 1080, height: altura }, chrome: caso.chrome });
  const slide = {
    index: 1, type: "cover", eyebrow: caso.eyebrow, title: caso.titulo, body: "",
    bullet_points: [], highlight_text: "", variant: "noticia_sem_foto",
    cover_variant: "dark_speaker", headline_style: "clean", cover_image_prompt: "",
    bg_image_url: "", cta_text: "",
  } as unknown as InstagramSlide;

  const ctx: VariantContext = {
    format: "noticia", tokens, eyebrowLabel: tokens.eyebrows.noticia.label,
    ctaText: tokens.cta.noticia.text, slideIndex: 1, total: 1,
  };

  const html = renderShell(coverNoticiaSemFoto.render(slide, ctx), { slideIndex: 1, total: 1, tokens })
    .replace("</head>", `<style>${CSS_NOVO}</style></head>`);
  writeFileSync(`${saida}/${caso.nome}.html`, html);

  const page = await browser.newPage({ viewport: { width: 1080, height: altura }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const h = document.querySelector(".n-manchete") as HTMLElement;
    const cs = getComputedStyle(h);
    const r = h.getBoundingClientRect();
    const doc = document.querySelector(".n-doc")!.getBoundingClientRect();
    return {
      corpo: cs.fontSize,
      linhas: Math.round(r.height / (parseFloat(cs.fontSize) * 1.05)),
      altura: Math.round(r.height),
      arCima: Math.round(r.top - doc.top - 30),
      arBaixo: Math.round(doc.bottom - r.bottom - 6),
      corpoDoc: Math.round(doc.height),
      estouraLargura: r.width > 920,
    };
  });
  console.log(caso.nome, JSON.stringify(m));
  await page.screenshot({ path: `${saida}/${caso.nome}.png` });
  await page.close();
}
await browser.close();
