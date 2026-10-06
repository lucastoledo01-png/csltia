import fs from "node:fs";
import path from "node:path";
import { assembleSlide } from "../lib/carousel-templates/assemble";
import { resolveFormatConfigFromDb, resolveTokens } from "../lib/carousel-templates/resolve";
import type { InstagramSlide } from "../lib/carousel-templates/types";

/**
 * Nenhum valor com unidade quebra de linha na arte (regra do dono, 06/10/2026).
 *
 * O teste de unidade (`valores-juntos.test.ts`) prova a MARCAÇÃO: o espaço
 * entre "US$" e "45.000" é U+00A0 em todo molde do feed. Isso não prova o
 * desenho, porque quem decide onde a linha vira é o navegador, com a fonte da
 * arte carregada e o corpo do tipo já ajustado pelo script de encaixe. Então
 * aqui cada valor é medido na peça montada: o trecho do texto vira um `Range`,
 * e um valor que quebrou ocupa caixas em duas alturas diferentes.
 *
 * A régua tem de saber dizer "não" (lição do auditor que nunca reprovava): a
 * mesma peça é medida também com o espaço comum de volta, e ali algum valor
 * TEM de quebrar. Se nenhum quebrar nem assim, a medição não está medindo nada.
 *
 *   npx tsx src/scripts/validar-valores-na-arte.ts --saida=/tmp/valores-na-arte
 */

function carregarEnv(): void {
  for (const arquivo of [".env.local", ".env"]) {
    const caminho = path.resolve(process.cwd(), arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [chave, ...resto] = t.split("=");
      const valor = resto.join("=").trim().replace(/^["']|["']$/g, "");
      if (chave && !process.env[chave.trim()]) process.env[chave.trim()] = valor;
    }
  }
}

/** Uma foto de 8x8 cinza, embutida: a peça com foto sem depender de rede. */
const FOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNoaGjAihiGpQQAMRxgAeJ6t0YAAAAASUVORK5CYII=";

/** Os valores que o dono citou, mais as formas da casa. */
const VALORES = ["US$ 45.000", "R$ 5", "US$ 2,9 bilhões", "8 %", "R$ 5 mil", "US$ 1,03 trilhão"];

/*
 * Palavras antes do valor, de zero a quatorze: o valor anda pela linha até
 * cair na virada em algum dos tamanhos. É o que acha o caso real, em que a
 * quebra depende de quantas letras vieram antes.
 */
const ENCHIMENTO = "Anthropic amplia programa para startups fundadas nos últimos cinco anos com até".split(" ");

/*
 * A medição, como TEXTO de JavaScript, e não como função do TypeScript: o tsx
 * injeta um ajudante (`__name`) nas funções aninhadas, e ele não existe dentro
 * da página. O texto do corpo inteiro é montado com um mapa de volta para o nó,
 * porque o valor pode atravessar um `<mark>` ("US$ <mark>45.000</mark>").
 */
const MEDIR_NO_NAVEGADOR = `function (valores) {
  var achados = [];
  var andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var nos = [];
  var todo = "";
  for (var n = andar.nextNode(); n; n = andar.nextNode()) {
    if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
    nos.push({ no: n, inicio: todo.length });
    todo += n.data;
  }
  function ponto(pos) {
    for (var i = nos.length - 1; i >= 0; i -= 1) if (nos[i].inicio <= pos) return { no: nos[i].no, off: pos - nos[i].inicio };
    return { no: nos[0].no, off: 0 };
  }
  var normal = todo.replace(/\\u00a0/g, " ");
  valores.forEach(function (valor) {
    var de = normal.indexOf(valor);
    while (de >= 0) {
      var a = ponto(de);
      var b = ponto(de + valor.length - 1);
      var r = document.createRange();
      r.setStart(a.no, a.off);
      r.setEnd(b.no, b.off + 1);
      var topos = {};
      Array.prototype.forEach.call(r.getClientRects(), function (c) { if (c.width > 0) topos[Math.round(c.top / 4)] = true; });
      if (Object.keys(topos).length > 1) achados.push(valor);
      de = normal.indexOf(valor, de + 1);
    }
  });
  return achados;
}`;

type Caso = { nome: string; variante: string; tipo: string; slide: Partial<InstagramSlide> };

function casos(): Caso[] {
  const saida: Caso[] = [];
  for (const valor of VALORES) {
    for (let n = 0; n <= ENCHIMENTO.length; n += 1) {
      const antes = ENCHIMENTO.slice(0, n).join(" ");
      const manchete = `${antes} ${valor} em descontos e créditos para empresas`.trim();
      saida.push({ nome: `capa_jornal/${valor}/${n}`, variante: "capa_jornal", tipo: "cover", slide: { title: manchete, bg_image_url: FOTO } });
      saida.push({ nome: `noticia_sem_foto/${valor}/${n}`, variante: "noticia_sem_foto", tipo: "cover", slide: { title: manchete } });
      saida.push({
        nome: `capa_destaque/${valor}/${n}`,
        variante: "capa_destaque",
        tipo: "cover",
        slide: { title: manchete, highlight_text: valor, bg_image_url: FOTO },
      });
      saida.push({
        nome: `miolo_jornal/${valor}/${n}`,
        variante: "miolo_jornal",
        tipo: "content",
        slide: { title: "O benefício", body: `${antes} ${valor} em descontos.`, bg_image_url: FOTO },
      });
      saida.push({
        nome: `recorte_post/${valor}/${n}`,
        variante: "recorte_post",
        tipo: "cover",
        slide: { title: `${antes} ${valor} em créditos`, body: "O programa foi lançado em maio.", bg_image_url: FOTO },
      });
    }
  }
  return saida;
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const saida = argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/valores-na-arte";
  fs.mkdirSync(saida, { recursive: true });

  const [tokens, formatConfig] = await Promise.all([resolveTokens("noticia"), resolveFormatConfigFromDb("noticia")]);
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined,
  });

  const problemas: string[] = [];
  let medidos = 0;
  let quebrasSemAJunta = 0;

  try {
    const page = await browser.newPage({ viewport: { width: tokens.canvas.width, height: tokens.canvas.height } });
    for (const caso of casos()) {
      const html = assembleSlide({ index: 1, type: caso.tipo, body: "", bullet_points: [], title: "", ...caso.slide } as InstagramSlide, {
        format: "noticia",
        tokens,
        formatConfig: { ...formatConfig, variantBySlideType: { ...formatConfig.variantBySlideType, [caso.tipo]: caso.variante } },
        slideIndex: 1,
        total: 1,
        molduraDiscreta: true,
      });

      // A mesma peça duas vezes: como sai, e com o espaço comum de volta (a régua tem de saber dizer não).
      for (const versao of ["como_sai", "sem_a_junta"] as const) {
        const documento = versao === "como_sai" ? html : html.replace(/ /g, " ");
        await page.setContent(documento, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page
          .waitForFunction(() => document.documentElement.getAttribute("data-ajuste-pronto") === "1", null, { timeout: 3_000 })
          .catch(() => undefined);

        const quebrados = (await page.evaluate(`(${MEDIR_NO_NAVEGADOR})(${JSON.stringify(VALORES)})`)) as string[];

        if (versao === "como_sai") {
          medidos += 1;
          for (const v of quebrados) problemas.push(`${caso.nome}: "${v}" quebrou de linha`);
          if (quebrados.length > 0) await page.screenshot({ path: path.join(saida, `${caso.nome.replace(/[^\w-]+/g, "_")}.png`) });
        } else {
          quebrasSemAJunta += quebrados.length;
        }
      }
    }
  } finally {
    await browser.close();
  }

  const relatorio = [
    `# Valores na arte (${new Date().toISOString()})`,
    "",
    `peças medidas: ${medidos} (capa de jornal, capa de texto, capa com destaque, miolo do jornal e recorte; ${VALORES.length} valores em ${ENCHIMENTO.length + 1} posições)`,
    `valores partidos na peça como sai: ${problemas.length}`,
    `valores partidos na mesma peça com o espaço comum (a prova de que a régua mede): ${quebrasSemAJunta}`,
    "",
    ...problemas.map((p) => `- ${p}`),
  ].join("\n");
  fs.writeFileSync(path.join(saida, "relatorio.md"), relatorio);
  console.log(relatorio);

  if (quebrasSemAJunta === 0) {
    console.error("A régua não achou quebra nem com o espaço comum: ela não está medindo nada.");
    process.exit(2);
  }
  if (problemas.length > 0) process.exit(1);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
