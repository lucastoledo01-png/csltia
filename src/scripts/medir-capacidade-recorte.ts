import { chromium } from "playwright";
import { assembleSlide } from "/Users/lucastoledo/Applications/AI Projects/Claude/csltia/src/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS } from "/Users/lucastoledo/Applications/AI Projects/Claude/csltia/src/lib/carousel-templates/tokens";
import type { InstagramSlide } from "/Users/lucastoledo/Applications/AI Projects/Claude/csltia/src/lib/carousel-templates/types";

const FOTO = "https://upload.wikimedia.org/wikipedia/commons/8/8d/Marriner_S._Eccles_Federal_Reserve_Board_Building.jpg";

// Frase de português real, com acento e palavra longa, que é o que o sistema
// escreve. Medir com "aaaa" daria um número que a realidade não alcança.
const BASE =
  "o preço do aluguel nos Estados Unidos subiu pelo quinto mês seguido e a alta se concentra nas cidades onde mais brasileiro mora com destaque para Orlando Miami Boston e Newark segundo o levantamento divulgado nesta semana pelo instituto de pesquisa ";

function texto(n: number): string {
  let s = "";
  while (s.length < n) s += BASE;
  return s.slice(0, n).trim();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: DEFAULT_TOKENS.canvas.width, height: DEFAULT_TOKENS.canvas.height },
  });

  async function transborda(chars: number, comFoto: boolean, proporcaoAbertura: number): Promise<boolean> {
    const abertura = Math.round(chars * proporcaoAbertura);
    const html = assembleSlide(
      {
        index: 1,
        type: "cover",
        title: texto(abertura),
        body: texto(chars - abertura),
        bullet_points: [],
        eyebrow: "Custo de vida",
        bg_image_url: comFoto ? FOTO : "",
      } as unknown as InstagramSlide,
      {
        format: "noticia",
        tokens: DEFAULT_TOKENS,
        formatConfig: { variantBySlideType: { cover: "recorte_post" }, eyebrowLabel: null, ctaText: null },
        slideIndex: 1,
        total: 5,
        molduraDiscreta: true,
      },
    );
    await page.setContent(html, { waitUntil: "networkidle" });
    return page.evaluate(() => {
      const el = document.querySelector(".r-texto") as HTMLElement | null;
      if (!el) return true;
      return el.scrollHeight > el.clientHeight + 1;
    });
  }

  for (const comFoto of [true, false]) {
    const medidas: number[] = [];
    // A divisão entre abertura e corpo muda a quebra de linha, e com ela a
    // capacidade. O orçamento tem que valer para a PIOR divisão, não para a
    // média: medir só uma proporção produziria um número que a peça real fura.
    for (const proporcao of [0.25, 0.4, 0.55, 0.7]) {
      let baixo = 40;
      let alto = 1400;
      while (alto - baixo > 4) {
        const meio = Math.round((baixo + alto) / 2);
        if (await transborda(meio, comFoto, proporcao)) alto = meio;
        else baixo = meio;
      }
      medidas.push(baixo);
      console.log(`  ${comFoto ? "COM" : "SEM"} foto, abertura em ${Math.round(proporcao * 100)}%: ${baixo} caracteres`);
    }
    console.log(`${comFoto ? "COM foto" : "SEM foto"}: pior caso ${Math.min(...medidas)} caracteres\n`);
  }

  await browser.close();
}

main();
