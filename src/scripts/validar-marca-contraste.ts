/**
 * A marca clara ou a escura, conferida em foto de verdade.
 *
 * O logotipo do topo tem o "usa" em branco e sumia em foto de céu claro: a
 * peça saía com meia marca. A decisão passou a ser medida no navegador, e este
 * script é o que prova que a medida acerta, em fotos reais das duas famílias.
 *
 * As fotos entram como data URL, igual à produção. Não é detalhe: com URL
 * remota o canvas fica marcado, getImageData lança, e a decisão cai no padrão
 * escuro sem nunca medir nada. Um validador com foto remota diria que está
 * tudo bem sem ter conferido coisa alguma.
 *
 * Uso: npx tsx src/scripts/validar-marca-contraste.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import type { InstagramSlide } from "@/lib/carousel-templates/types";

/*
 * O destino sai do ambiente, e nao do caminho de quem escreveu.
 *
 * Estava cravado no scratchpad de uma sessao, o que faz o script
 * funcionar numa maquina so. `PREVIEW_SAIDA` manda quando existe, e o
 * padrao e a pasta temporaria do proprio sistema.
 */
const SAIDA = path.join(process.env.PREVIEW_SAIDA || os.tmpdir(), "usa-journal", "marca");
fs.mkdirSync(SAIDA, { recursive: true });

const FOTOS: Array<{ nome: string; url: string; esperado: "claro" | "escuro" }> = [
  {
    nome: "1-ceu-claro",
    // Céu branco atrás do canto superior esquerdo: é o caso que o dono relatou.
    url: "https://upload.wikimedia.org/wikipedia/commons/8/8d/Marriner_S._Eccles_Federal_Reserve_Board_Building.jpg",
    esperado: "claro",
  },
  {
    nome: "2-ceu-claro-forte",
    // Conferido fora do navegador, com Pillow: o pedaço atrás do logotipo tem
    // brilho 0.953. É o caso extremo do céu branco.
    url: "https://upload.wikimedia.org/wikipedia/commons/4/46/John_Joseph_Moakley_United_States_Courthouse_September_2024.jpg",
    esperado: "claro",
  },
  {
    nome: "3-noite",
    // O outro extremo: Manhattan à noite. Sem um caso escuro, o validador
    // provaria só metade da régua, e a metade que já é o padrão.
    url: "https://upload.wikimedia.org/wikipedia/commons/2/22/New_York_City_at_night_HDR.jpg",
    esperado: "escuro",
  },
];

async function comoDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "NewsroomBot/1.0 (+https://casaloti.ia.br)" } });
  const buffer = Buffer.from(await r.arrayBuffer());
  const tipo = r.headers.get("content-type") ?? "image/jpeg";
  return `data:${tipo};base64,${buffer.toString("base64")}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: DEFAULT_TOKENS.canvas.width, height: DEFAULT_TOKENS.canvas.height },
  });

  let erros = 0;

  for (const foto of FOTOS) {
    const html = assembleSlide(
      {
        index: 1,
        type: "cover",
        eyebrow: "Economia",
        title: "O Federal Reserve cortou os juros e sinalizou mais dois cortes até o fim do ano",
        body: "",
        bullet_points: [],
        bg_image_url: await comoDataUrl(foto.url),
      } as unknown as InstagramSlide,
      {
        format: "noticia",
        tokens: DEFAULT_TOKENS,
        formatConfig: { variantBySlideType: { cover: "capa_jornal" }, eyebrowLabel: null, ctaText: null },
        slideIndex: 1,
        total: 1,
        molduraDiscreta: true,
      },
    );

    await page.setContent(html, { waitUntil: "networkidle" });
    await page
      .waitForFunction('document.documentElement.getAttribute("data-ajuste-pronto") === "1"', { timeout: 15000 })
      .catch(() => {});

    const medida = await page.evaluate(() => {
      const m = document.querySelector("img.j-marca") as HTMLImageElement | null;
      return {
        sobre: m?.getAttribute("data-sobre") ?? "escuro",
        brilho: m?.getAttribute("data-brilho") ?? "não medido",
        erro: m?.getAttribute("data-erro") ?? "",
        arquivo: (m?.getAttribute("src") ?? "").split("/").pop(),
      };
    });

    await page.screenshot({ path: `${SAIDA}/${foto.nome}.png` });

    /*
     * Acertar por acaso não conta.
     *
     * A marca escura é o padrão: uma peça que nunca mediu nada "acerta" toda
     * foto escura sem ter conferido coisa alguma. Por isso o brilho medido é
     * exigido junto com a decisão.
     */
    const ok = medida.sobre === foto.esperado && medida.brilho !== "não medido";
    if (!ok) erros++;
    console.log(
      `${ok ? "ok  " : "ERRO"} ${foto.nome}: brilho ${medida.brilho}, escolheu marca ${medida.sobre} ` +
        `(${medida.arquivo}), esperado ${foto.esperado}${medida.erro ? ` :: ${medida.erro}` : ""}`,
    );
  }

  await browser.close();
  console.log(`\npeças em ${SAIDA}`);
  if (erros > 0) process.exitCode = 1;
}

main();
