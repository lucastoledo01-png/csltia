import fs from "node:fs";
import path from "node:path";
import { renderizarCapas } from "../lib/server/social/arte";
import { resolveTokens } from "../lib/carousel-templates/resolve";
import { entradasDoCarrossel } from "../lib/server/social/carrossel/arte";
import { papeisPara, type EstruturaDoCarrossel } from "../lib/server/social/carrossel/estrutura";
import type { CopyDoCarrossel } from "../lib/server/social/carrossel/copy";

/**
 * As quatro estruturas de carrossel, desenhadas de verdade, nos limites de texto
 * que o schema permite.
 *
 * O teste unitário prova a marcação: o papel certo no slide certo, a variante
 * certa, as duas colunas preenchidas. Nada disso prova LEGIBILIDADE, porque
 * quem decide o corpo final é o navegador, depois das fontes carregarem.
 *
 * O modo de falhar é conhecido e está em `SCRIPT_DE_AJUSTE`: quando o texto não
 * cabe nem no piso de `data-min`, o script desiste e aplica `overflow: hidden`,
 * ou seja, CORTA. Um slide cortado passa por todo teste de marcação e chega ao
 * feed sem a última linha. A regra do pedido é explícita: se não cabe, reduzir
 * informação ou acrescentar slide, nunca diminuir a fonte até ficar ruim.
 *
 * Então a validação é: no MÁXIMO que o schema aceita (título de 70, corpo de
 * 260, três bullets de 90, colunas de 120), nenhum slide corta, nenhum
 * transborda o quadro, a paginação aparece só quando há mais de um slide, e o
 * `SWIPE` não aparece.
 *
 *   npx tsx src/scripts/validar-carrossel.ts --saida=/tmp/carrossel
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

/** Exatamente o teto de cada campo, que é onde a peça quebra se for quebrar. */
const T = (n: number, base: string) => base.repeat(Math.ceil(n / base.length)).slice(0, n).trim();

const TITULO_CHEIO = T(70, "Prova de origem lícita do dinheiro investido no negócio ");
const CORPO_CHEIO = T(
  260,
  "A USCIS exige documento que mostre de onde veio cada dólar, e o caminho do dinheiro precisa aparecer inteiro, da origem até a conta do negócio, sem lacuna entre uma transferência e a seguinte. ",
);
const BULLET_CHEIO = T(90, "Extrato bancário dos últimos cinco anos com a origem de cada depósito relevante ");
const LADO_CHEIO = T(120, "Quem está nos Estados Unidos e é elegível pode pedir sem sair do país, pelo ajuste de status ");

function copyCheia(estrutura: EstruturaDoCarrossel, comCta: boolean): CopyDoCarrossel {
  const papeis = papeisPara(estrutura, 7, comCta);
  const doModelo = papeis.filter((p) => !p.escritoEmCodigo);

  return {
    headline: "Prova da origem do dinheiro no visto de investidor americano",
    destaque: "origem do dinheiro",
    gancho: "A USCIS quer ver o caminho do dinheiro inteiro.",
    fato_principal: "Quem investe precisa mostrar de onde veio cada dólar.",
    contexto: "",
    informacao_util: "",
    ressalva: "A página não informa prazo de análise.",
    cta: comCta ? "Comente VISA e receba no Direct uma leitura do seu perfil." : "",
    hashtags: ["#EB5", "#ImigracaoEUA", "#EstadosUnidos"],
    slides: doModelo.map((p) => ({
      papel: p.papel,
      titulo: TITULO_CHEIO,
      corpo: p.variante === "comparacao_duas_colunas" ? "" : CORPO_CHEIO,
      /* Bullets só onde a variante os desenha, e no máximo permitido. */
      bullets: p.tipo === "step" ? [BULLET_CHEIO, BULLET_CHEIO, BULLET_CHEIO] : [],
      lado_a: p.variante === "comparacao_duas_colunas" ? LADO_CHEIO : "",
      lado_b: p.variante === "comparacao_duas_colunas" ? LADO_CHEIO : "",
    })),
  } as CopyDoCarrossel;
}

type Medida = {
  estrutura: string;
  posicao: number;
  papel: string;
  variante: string;
  corpoFinal: number;
  piso: number;
  cortou: boolean;
  vazou: boolean;
  paginacao: string;
  temSwipe: boolean;
  colunas: number;
  forasteiro: string;
};

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const saida = argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/carrossel";
  fs.mkdirSync(saida, { recursive: true });

  const tokens = await resolveTokens("noticia");
  const quadro = { width: tokens.canvas.width, height: tokens.canvas.height };

  const estruturas: EstruturaDoCarrossel[] = ["explainer", "comparison", "process", "faq"];
  const casos = estruturas.flatMap((estrutura) =>
    [true, false].map((comCta) => ({ estrutura, comCta })),
  );

  /*
   * Um render para todos os casos, e um navegador só.
   *
   * `renderizarCapas` reusa uma página para a lista inteira. Chamar por caso
   * subiria oito Chromium para desenhar quarenta slides.
   */
  const porCaso = casos.map((c) => {
    const copy = copyCheia(c.estrutura, c.comCta);
    const papeis = papeisPara(c.estrutura, 7, c.comCta);
    const montado = entradasDoCarrossel(copy, papeis, {
      eixo: "imigracao",
      asset: null,
      motivoSemFoto: "NO_VALID_IMAGE",
    });
    return { ...c, papeis, entradas: montado.entradas };
  });

  const artes = await renderizarCapas(porCaso.flatMap((c) => c.entradas));

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined,
  });

  const medidas: Medida[] = [];
  const problemas: string[] = [];

  try {
    const page = await browser.newPage({ viewport: quadro, deviceScaleFactor: 1 });
    let cursor = 0;

    for (const caso of porCaso) {
      const rotulo = `${caso.estrutura}${caso.comCta ? "-com-cta" : "-sem-cta"}`;
      const pasta = path.join(saida, rotulo);
      fs.mkdirSync(pasta, { recursive: true });

      for (let i = 0; i < caso.entradas.length; i += 1) {
        const arte = artes[cursor];
        cursor += 1;
        if (!arte) continue;

        const papel = caso.papeis[i];
        fs.writeFileSync(path.join(pasta, `slide-${String(i + 1).padStart(2, "0")}.png`), arte.png);

        await page.setContent(arte.html, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page
          .waitForFunction(() => document.documentElement.getAttribute("data-ajuste-pronto") === "1", null, {
            timeout: 5_000,
          })
          .catch(() => undefined);

        const m = await page.evaluate(() => {
          const ajustaveis = [...document.querySelectorAll<HTMLElement>('[data-ajuste="encolher"]')];

          let corpoFinal = 0;
          let piso = 0;
          let cortou = false;

          for (const el of ajustaveis) {
            const estilo = getComputedStyle(el);
            const px = parseFloat(estilo.fontSize) || 0;
            corpoFinal = Math.max(corpoFinal, px);
            piso = Math.max(piso, Number(el.dataset.min ?? 0));

            /*
             * A medida é a do próprio SCRIPT_DE_AJUSTE: o SPAN contra a altura
             * útil do bloco. Medir `el.scrollHeight` contra `el.clientHeight`
             * dá falso positivo, porque o bloco é flex com
             * `justify-content: flex-end` e reporta scroll mesmo com o texto
             * inteiro dentro. Foi o que aconteceu na primeira volta: quarenta
             * slides acusados de corte, nenhum cortado.
             *
             * E o sinal definitivo é `overflow: hidden` inline, que é como o
             * script registra que desistiu de encolher.
             */
            const span = el.firstElementChild as HTMLElement | null;
            const padY = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
            const util = el.clientHeight - padY;

            if (el.style.overflow === "hidden") cortou = true;
            if (span && span.scrollHeight > util + 1) cortou = true;
          }

          const corpo = document.querySelector<HTMLElement>(".slide");
          const vazou = corpo
            ? corpo.scrollHeight > corpo.clientHeight + 1 || corpo.scrollWidth > corpo.clientWidth + 1
            : false;

          const pill = document.querySelector(".c-head .pill, .c-head .count");
          const texto = document.body.innerText;

          return {
            corpoFinal,
            piso,
            cortou,
            vazou,
            paginacao: pill ? (pill.textContent ?? "").replace(/\s+/g, "") : "",
            temSwipe: texto.includes("SWIPE"),
            colunas: document.querySelectorAll(".e-duo .col").length,
            /*
             * Texto de outro nicho impresso na arte.
             *
             * A variante que o papel declara pode não existir para aquele TIPO
             * de slide, e aí `assembleSlide` cai na primeira variante do tipo.
             * Foi o que aconteceu com "para quem": a primeira variante de
             * `practical_impact` é a do nicho de tecnologia e traz
             * "COMO APLICAR EM REDES & VENDAS" cravado no HTML. Nenhum teste de
             * unidade viu, porque a resolução acontece no render.
             */
            forasteiro: ["REDES & VENDAS", "REDES &amp; VENDAS", "PROMPT", "desbuguei"].find((t) =>
              texto.toUpperCase().includes(t.toUpperCase()),
            ) ?? "",
          };
        });

        medidas.push({
          estrutura: rotulo,
          posicao: i + 1,
          papel: papel?.papel ?? "?",
          variante: papel?.variante ?? papel?.tipo ?? "?",
          ...m,
        });

        if (m.cortou) problemas.push(`${rotulo} slide ${i + 1} (${papel?.papel}): TEXTO CORTADO`);
        if (m.vazou) problemas.push(`${rotulo} slide ${i + 1} (${papel?.papel}): vazou o quadro`);
        if (m.temSwipe) problemas.push(`${rotulo} slide ${i + 1}: imprimiu SWIPE`);
        if (m.forasteiro) {
          problemas.push(`${rotulo} slide ${i + 1}: imprimiu texto de outro nicho ("${m.forasteiro}")`);
        }
        if (papel?.variante === "comparacao_duas_colunas" && m.colunas !== 2) {
          problemas.push(`${rotulo} slide ${i + 1}: comparação desenhou ${m.colunas} coluna(s)`);
        }
        const esperado = String(i + 1).padStart(2, "0") + "/" + String(caso.entradas.length).padStart(2, "0");
        if (m.paginacao && m.paginacao !== esperado) {
          problemas.push(`${rotulo} slide ${i + 1}: paginação "${m.paginacao}", esperado "${esperado}"`);
        }
        if (!m.paginacao && caso.entradas.length > 1) {
          problemas.push(`${rotulo} slide ${i + 1}: carrossel sem indicador de posição`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const linhas: string[] = [
    "# Carrossel no máximo de texto que o schema aceita",
    "",
    `Quadro: ${quadro.width}x${quadro.height}. Título de 70, corpo de 260, três bullets de 90, colunas de 120.`,
    "",
    "| caso | # | papel | variante | corpo final | piso | cortou | vazou | paginação | SWIPE | colunas | forasteiro |",
    "| --- | ---: | --- | --- | ---: | ---: | --- | --- | --- | --- | ---: | --- |",
  ];

  for (const m of medidas) {
    linhas.push(
      `| ${m.estrutura} | ${m.posicao} | ${m.papel} | ${m.variante} | ${m.corpoFinal.toFixed(0)} | ${m.piso} | ` +
        `${m.cortou ? "**SIM**" : "não"} | ${m.vazou ? "**SIM**" : "não"} | ${m.paginacao || "(nenhuma)"} | ` +
        `${m.temSwipe ? "**SIM**" : "não"} | ${m.colunas} | ${m.forasteiro ? `**${m.forasteiro}**` : "não"} |`,
    );
  }

  linhas.push("");
  linhas.push(
    problemas.length === 0
      ? `Nenhum problema em ${medidas.length} slides desenhados.`
      : `## ${problemas.length} problema(s)\n\n${problemas.map((p) => `- ${p}`).join("\n")}`,
  );

  const relatorio = path.join(saida, "relatorio.md");
  fs.writeFileSync(relatorio, linhas.join("\n"), "utf-8");
  console.log(linhas.join("\n"));
  console.log(`\nPNGs e relatório em ${saida}`);

  if (argv.includes("--varredura")) await varredura(saida);

  if (problemas.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Quanto texto cabe num slide de conteúdo sem o ajuste encolher até o piso.
 *
 * Chamado com `--varredura`. O teto de caracteres do schema foi escolhido por
 * estimativa, e estimativa de largura de caractere é exatamente o erro que o
 * comentário de `coverNoticiaSemFoto` registra: Playfair é largo, a média
 * assumida erra para baixo, e o ajuste encolhe até o piso. Quem sabe é o
 * navegador.
 */
export async function varredura(saida: string): Promise<void> {
  const tokens = await resolveTokens("noticia");
  const quadro = { width: tokens.canvas.width, height: tokens.canvas.height };

  const tamanhos = [100, 140, 180, 220, 260, 300];
  const papeis = papeisPara("explainer", 6, true);
  const doModelo = papeis.filter((p) => !p.escritoEmCodigo);
  const papelDeConteudo = doModelo[0];

  const entradas = tamanhos.map((n) => {
    const copy = copyCheia("explainer", true);
    copy.slides = copy.slides.map((s) => ({ ...s, corpo: T(n, CORPO_CHEIO + " ") }));
    const montado = entradasDoCarrossel(copy, papeis, {
      eixo: "imigracao",
      asset: null,
      motivoSemFoto: "NO_VALID_IMAGE",
    });
    /* Só o primeiro slide de conteúdo interessa: é o mesmo desenho nos outros. */
    return montado.entradas[papeis.indexOf(papelDeConteudo)];
  });

  const artes = await renderizarCapas(entradas);
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined,
  });

  const linhas = ["", "## Varredura: corpo do slide de conteúdo", "", "| caracteres | corpo final | piso | encolheu | cortou |", "| ---: | ---: | ---: | --- | --- |"];

  try {
    const page = await browser.newPage({ viewport: quadro, deviceScaleFactor: 1 });

    for (let i = 0; i < artes.length; i += 1) {
      await page.setContent(artes[i].html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page
        .waitForFunction(() => document.documentElement.getAttribute("data-ajuste-pronto") === "1", null, {
          timeout: 5_000,
        })
        .catch(() => undefined);

      const m = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.e-lede[data-ajuste="encolher"]');
        if (!el) return { px: 0, min: 0, max: 0, cortou: false };
        const estilo = getComputedStyle(el);
        const span = el.firstElementChild as HTMLElement | null;
        const padY = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
        return {
          px: parseFloat(estilo.fontSize) || 0,
          min: Number(el.dataset.min ?? 0),
          max: Number(el.dataset.max ?? 0),
          cortou: el.style.overflow === "hidden" || Boolean(span && span.scrollHeight > el.clientHeight - padY + 1),
        };
      });

      linhas.push(
        `| ${tamanhos[i]} | ${m.px.toFixed(0)} | ${m.min} | ${m.px < m.max ? "sim" : "não"} | ${m.cortou ? "**SIM**" : "não"} |`,
      );
    }
  } finally {
    await browser.close();
  }

  fs.appendFileSync(path.join(saida, "relatorio.md"), linhas.join("\n"), "utf-8");
  console.log(linhas.join("\n"));
}
