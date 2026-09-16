/**
 * Renderiza as peças da gramática de jornal, para olhar antes de publicar.
 *
 * Existe porque as duas correções que este desenho precisou não apareceriam em
 * teste nenhum: a bolha colidindo com o chapéu, e a manchete crescendo sem
 * limite porque `max-height` em porcentagem não resolve contra pai de altura
 * automática. As duas só apareceram na imagem.
 *
 * Uso: npx tsx src/scripts/preview-jornal.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import type { InstagramSlide } from "@/lib/carousel-templates/types";

const SAIDA = "/private/tmp/claude-501/-Users-lucastoledo-Applications-AI-Projects-Claude/381cd9c6-282d-49ea-b3b1-f4e1c8385248/scratchpad/jornal";
fs.mkdirSync(SAIDA, { recursive: true });

const FOTO = "https://images.pexels.com/photos/8828687/pexels-photo-8828687.jpeg?auto=compress&cs=tinysrgb&w=1600";
const BOLHA = "https://images.pexels.com/photos/5668473/pexels-photo-5668473.jpeg?auto=compress&cs=tinysrgb&w=900";

const peças: Array<{ nome: string; slide: Partial<InstagramSlide>; tipo: string; variante: string }> = [
  {
    nome: "1-capa-com-bolha",
    tipo: "cover",
    variante: "capa_jornal",
    slide: {
      eyebrow: "Vistos profissionais",
      title: "Profissionais de cibersegurança encontram no visto O-1 uma via para os Estados Unidos",
      bg_image_url: FOTO,
      inset_image_url: BOLHA,
    },
  },
  {
    // A medida da referência: 15 palavras, 105 caracteres, três a quatro
    // linhas. É o caso que a faixa precisa segurar em corpo legível, e era o
    // que a régua antiga recusava antes de chegar à arte.
    nome: "2-capa-na-medida-da-referencia",
    tipo: "cover",
    variante: "capa_jornal",
    slide: {
      eyebrow: "Decisão judicial",
      title:
        "Decisão em Boston adia a regra de prazo fixo: estudante com F-1 segue no status atual até 27 de outubro",
      bg_image_url: FOTO,
      inset_image_url: BOLHA,
    },
  },
  {
    // O teto: 130 caracteres. Se este couber, nenhum aprovado pela guarda
    // estoura a faixa.
    nome: "3-capa-no-teto",
    tipo: "cover",
    variante: "capa_jornal",
    slide: {
      eyebrow: "Processo",
      title:
        "Renovação automática da permissão de trabalho vai a 540 dias: quem pediu a troca de status entra na conta a partir de janeiro",
      bg_image_url: FOTO,
    },
  },
  {
    nome: "4-capa-manchete-curta",
    tipo: "cover",
    variante: "capa_jornal",
    slide: { eyebrow: "Boletim de vistos", title: "Boletim de outubro avança para EB-2", bg_image_url: FOTO },
  },
  {
    nome: "5-miolo",
    tipo: "content",
    variante: "miolo_jornal",
    slide: {
      eyebrow: "Trabalho nos EUA",
      title: "O registro anual é obrigatório e o sorteio decide quem segue para a petição",
      bg_image_url: BOLHA,
    },
  },
  {
    nome: "6-cta",
    tipo: "cta",
    variante: "cta_newsletter",
    slide: { title: "", body: "A edição do dia no seu e-mail, todo dia às 6h. De graça.", highlight_text: "news" },
  },
];

const navegador = await chromium.launch();
for (const p of peças) {
  const html = assembleSlide({ type: p.tipo, ...p.slide } as InstagramSlide, {
    format: "noticia",
    tokens: DEFAULT_TOKENS,
    formatConfig: { variantBySlideType: { [p.tipo]: p.variante }, eyebrowLabel: null, ctaText: null },
    slideIndex: 0,
    total: 5,
    molduraDiscreta: true,
  });
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SAIDA}/${p.nome}.png` });
  await page.close();
  console.log("renderizado:", p.nome);
}
await navegador.close();
