import fs from "node:fs";
import path from "node:path";
import { montarCapaDoPost, renderizarCapas } from "../lib/server/social/arte";
import { montarAtribuicao } from "../lib/server/visual/licencas";
import { assembleSlide } from "../lib/carousel-templates/assemble";
import { resolveFormatConfigFromDb, resolveTokens } from "../lib/carousel-templates/resolve";

/**
 * A capa de texto nos extremos que o Social Guard permite.
 *
 * O teste unitário prova a marcação: nenhum cartão vazio, nenhuma affordance
 * de carrossel, o corpo do tipo não fixado no HTML. Nada disso prova
 * legibilidade, porque quem decide o corpo final é o navegador, depois das
 * fontes carregarem.
 *
 * O modo de falhar é conhecido e está em `SCRIPT_DE_AJUSTE`: se a manchete não
 * couber nem no piso de `data-min`, o script desiste e aplica
 * `overflow: hidden`, ou seja, CORTA o texto. Uma manchete cortada passa por
 * todos os testes de marcação e chega ao feed sem a última palavra.
 *
 * Então a validação aqui é só uma: em todo o intervalo que a guarda aceita (3
 * a 12 palavras), o ajuste tem que fechar acima do piso e sem corte.
 *
 * A medição roda sobre o `html` que `renderizarCapas` devolve, que é o mesmo
 * documento que virou PNG. Não é uma reconstrução do caminho: é o documento.
 *
 *   npx tsx src/scripts/validar-capa-de-texto.ts --saida=/tmp/capa-de-texto
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

/*
 * Os extremos são os da guarda, não os que eu escolheria.
 *
 * `conferirFormaDaHeadline` recusa abaixo de 3 e acima de 12 palavras, então é
 * exatamente nesse intervalo que a arte precisa sobreviver. O pior caso não é
 * o de mais palavras: é o de mais LARGURA, porque Playfair Display 800 é
 * largo e o script encolhe por largura também. Daí a manchete de 12 palavras
 * compridas.
 */
const CASOS: Array<{ nome: string; headline: string; eixo: string; credito?: string }> = [
  { nome: "3-palavras-minimo-da-guarda", headline: "Corte suspende decreto", eixo: "decisao_judicial" },
  { nome: "6-palavras-tipica", headline: "USCIS muda prazo de análise do I-765", eixo: "processo" },
  {
    nome: "codigos-de-formulario-e-visto",
    headline: "Fila do EB-2 anda e o H-1B trava até 2027",
    eixo: "oportunidade",
  },
  {
    nome: "12-palavras-teto-da-guarda",
    headline: "Departamento de Estado suspende entrevistas de visto em consulados brasileiros até outubro",
    eixo: "processo",
  },
  /*
   * Acima do teto de propósito.
   *
   * A guarda recusa 15 palavras, então isto não chega ao feed pelo caminho
   * normal. Vale como margem: se a arte sobrevive ao que a guarda já barra,
   * ela sobrevive ao que a guarda deixa passar.
   */
  {
    nome: "15-palavras-acima-do-teto",
    headline: "Departamento de Estado suspende entrevistas de visto em consulados do Brasil a partir de outubro",
    eixo: "processo",
  },
  {
    nome: "12-palavras-compridas-pior-caso",
    headline:
      "Administração restringe elegibilidade transnacional preferencial extraordinária internacional multinacional intracompanhia investidor empreendedor sobrestada permanentemente",
    eixo: "oportunidade",
  },
  {
    nome: "sem-eixo-conhecido",
    headline: "Prefeitura de Miami aprova novo programa de moradia",
    eixo: "outro",
  },
  {
    nome: "com-credito-de-licenca",
    headline: "Suprema Corte aceita analisar regra de asilo",
    eixo: "decisao_judicial",
    credito: "Foto: Joe Ravi / CC BY-SA 3.0",
  },
];

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const saida = argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/capa-de-texto";
  fs.mkdirSync(saida, { recursive: true });

  /*
   * O crédito não é parâmetro de `renderizarCapas`: ele sai do asset. Como
   * aqui não existe asset, o caso com crédito é montado à mão pelo mesmo
   * `montarCapaDoPost`, e o que se confere é a decisão, não o pixel.
   */
  const semCredito = CASOS.filter((c) => !c.credito);

  const artes = await renderizarCapas(
    semCredito.map((c) => ({ headline: c.headline, eixo: c.eixo, asset: null, motivoSemFoto: "NO_VALID_IMAGE" })),
  );

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined,
  });

  /*
   * O quadro é o dos tokens, não um número meu.
   *
   * Na primeira volta eu abri a página em 1080x1350 e o relatório acusou a
   * tira de crédito "fora do quadro". Não estava: o canvas de notícia tem
   * 1440 de altura, e a tira mora no rodapé dele. Era a régua que estava
   * errada, e uma régua errada aqui condena arte boa.
   */
  const [tokens, formatConfig] = await Promise.all([resolveTokens("noticia"), resolveFormatConfigFromDb("noticia")]);
  const quadro = { width: tokens.canvas.width, height: tokens.canvas.height };

  const problemas: string[] = [];
  const linhas: string[] = [
    "# Capa de texto nos extremos",
    "",
    "| caso | palavras | corpo final | piso | linhas | cortada | vazamento | 01/01 | SWIPE | bloco vazio |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
  ];

  try {
    const page = await browser.newPage({ viewport: quadro, deviceScaleFactor: 1 });

    for (let i = 0; i < artes.length; i += 1) {
      const caso = semCredito[i];
      const arte = artes[i];

      fs.writeFileSync(path.join(saida, `${caso.nome}.png`), arte.png);

      await page.setContent(arte.html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page
        .waitForFunction(() => document.documentElement.getAttribute("data-ajuste-pronto") === "1", null, {
          timeout: 5_000,
        })
        .catch(() => undefined);

      const medida = await page.evaluate(() => {
        const bloco = document.querySelector<HTMLElement>('.n-manchete.lay-texto[data-ajuste="encolher"]');
        if (!bloco) return null;
        const span = bloco.firstElementChild as HTMLElement | null;
        const estilo = window.getComputedStyle(bloco);
        const padY = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
        const alturaDisponivel = bloco.clientHeight - padY;
        const corpo = parseFloat(estilo.fontSize);
        const alturaDaLinha = parseFloat(window.getComputedStyle(span ?? bloco).lineHeight) || corpo * 1.1;
        return {
          corpo,
          piso: parseFloat(bloco.getAttribute("data-min") ?? "0"),
          teto: parseFloat(bloco.getAttribute("data-max") ?? "0"),
          /* `overflow: hidden` só é aplicado quando o script desistiu. É a assinatura do corte. */
          cortada: bloco.style.overflow === "hidden",
          vazou: span ? span.scrollHeight > alturaDisponivel + 1 : false,
          linhas: span ? Math.round(span.scrollHeight / alturaDaLinha) : 0,
          /* A peça é única: nenhum contador, nenhuma seta, nenhum ponto. */
          temContador: /\b01\s*\/\s*01\b/.test(document.body.innerText),
          temSwipe: /SWIPE|PROGRESSO/.test(document.body.innerText),
          temCartao: document.querySelectorAll(".s-card, .s-photo").length,
          textoVisivel: (span?.innerText ?? "").trim(),
          /*
           * Código partido em duas linhas.
           *
           * `white-space:nowrap` no span deveria bastar, mas a prova está na
           * caixa: um código quebrado ocupa dois retângulos de cliente, e um
           * inteiro ocupa um.
           */
          codigosPartidos: [...document.querySelectorAll<HTMLElement>(".n-junto")]
            .filter((e) => e.getClientRects().length > 1)
            .map((e) => e.innerText),
        };
      });

      if (!medida) {
        problemas.push(`${caso.nome}: o bloco .n-manchete nem foi emitido`);
        continue;
      }

      const palavras = caso.headline.trim().split(/\s+/).length;
      const ok = (b: boolean) => (b ? "**SIM**" : "não");
      linhas.push(
        `| ${caso.nome} | ${palavras} | ${medida.corpo}px | ${medida.piso}px | ${medida.linhas} | ` +
          `${ok(medida.cortada)} | ${ok(medida.vazou)} | ${ok(medida.temContador)} | ${ok(medida.temSwipe)} | ` +
          `${medida.temCartao > 0 ? `**${medida.temCartao}**` : "não"} |`,
      );

      for (const cod of medida.codigosPartidos) {
        problemas.push(`${caso.nome}: o código "${cod}" quebrou de linha`);
      }
      if (medida.cortada) problemas.push(`${caso.nome}: manchete cortada, o ajuste bateu no piso de ${medida.piso}px`);
      if (medida.vazou) problemas.push(`${caso.nome}: a manchete vaza da caixa`);
      if (medida.temContador) problemas.push(`${caso.nome}: contador 01/01 numa peça única`);
      if (medida.temSwipe) problemas.push(`${caso.nome}: affordance de carrossel numa peça única`);
      if (medida.temCartao > 0) problemas.push(`${caso.nome}: ${medida.temCartao} bloco(s) de cartão/foto vazios`);
      if (medida.corpo < medida.piso) problemas.push(`${caso.nome}: corpo ${medida.corpo}px abaixo do piso`);
      /*
       * A última palavra é o que se perde primeiro num corte, e é o que denuncia
       * o corte quando o `overflow` já foi aplicado numa volta anterior.
       */
      const ultima = caso.headline.trim().split(/\s+/).pop() ?? "";
      if (!medida.textoVisivel.includes(ultima)) {
        problemas.push(`${caso.nome}: a última palavra ("${ultima}") não está no texto renderizado`);
      }
    }
  } finally {
    await browser.close();
  }

  // ------------------------------------------------------------------
  // O crédito da licença, no string que o resolver realmente produz.
  // ------------------------------------------------------------------
  linhas.push("", "## Crédito de licença", "");

  const atribuicaoReal = montarAtribuicao({
    autor: "<a href='/wiki/User:JoeRavi'>Joe Ravi</a>",
    fonte: "Wikimedia Commons",
    licenca: "CC BY-SA 3.0",
    exigeAtribuicao: true,
  });
  const semExigencia = montarAtribuicao({
    autor: "US Department of State",
    fonte: "state.gov",
    licenca: "Public domain",
    exigeAtribuicao: false,
  });

  linhas.push(`- CC BY-SA 3.0: \`${atribuicaoReal}\``);
  linhas.push(`- domínio público: \`${semExigencia || "(nenhum, e é correto)"}\``);
  if (!atribuicaoReal.includes("Joe Ravi")) problemas.push("o autor não sobreviveu à limpeza do HTML do Commons");
  if (atribuicaoReal.includes("<a")) problemas.push("o HTML do campo de autor do Commons vazou para a arte");
  if (!atribuicaoReal.includes("CC BY-SA 3.0")) problemas.push("a licença não aparece no crédito");
  if (semExigencia) problemas.push("licença que não exige atribuição imprimiu crédito");

  const capaDeTexto = montarCapaDoPost({ headline: CASOS[0].headline, eixo: CASOS[0].eixo, asset: null });
  if (capaDeTexto.credito) problemas.push("capa de texto imprimiu crédito sem ter foto para creditar");
  linhas.push(`- capa de texto: \`${capaDeTexto.credito || "(nenhum, e é correto)"}\``);

  /*
   * A tira impressa, medida.
   *
   * O crédito só cumpre a licença se estiver visível no PNG. Guardar o autor
   * numa coluna e não desenhar a tira é registro, não atribuição. O documento
   * aqui é montado pelo mesmo `assembleSlide` com o mesmo argumento `credito`
   * que `renderizarCapas` passa.
   */
  const navegador2 = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined,
  });
  try {
    const p2 = await navegador2.newPage({ viewport: quadro, deviceScaleFactor: 1 });
    const htmlComCredito = assembleSlide(capaDeTexto.slide, {
      format: "noticia",
      tokens,
      formatConfig,
      slideIndex: 1,
      total: 1,
      layout: null,
      credito: atribuicaoReal,
    });
    await p2.setContent(htmlComCredito, { waitUntil: "networkidle" });
    await p2.evaluate(() => document.fonts.ready);
    const tira = await p2.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".s-credito");
      if (!el) return null;
      const caixa = el.getBoundingClientRect();
      const peca = document.querySelector<HTMLElement>(".slide")?.getBoundingClientRect();
      const manchete = document.querySelector<HTMLElement>(".n-manchete")?.getBoundingClientRect();
      const estilo = window.getComputedStyle(el);
      return {
        texto: el.innerText.trim(),
        corpo: parseFloat(estilo.fontSize),
        dentroDaPeca: peca
          ? caixa.top >= peca.top - 1 &&
            caixa.bottom <= peca.bottom + 1 &&
            caixa.left >= peca.left - 1 &&
            caixa.right <= peca.right + 1
          : false,
        quadro: peca ? `${Math.round(peca.width)}x${Math.round(peca.height)}` : "sem .slide",
        rodape: peca ? Math.round(peca.bottom - caixa.bottom) : -1,
        colideComManchete: manchete ? caixa.top < manchete.bottom && caixa.bottom > manchete.top : false,
      };
    });
    if (!tira) {
      problemas.push("a tira de crédito não foi desenhada");
    } else {
      linhas.push(
        `- tira impressa: \`${tira.texto}\`, ${tira.corpo}px, peça ${tira.quadro}, ` +
          `dentro da peça ${tira.dentroDaPeca ? "sim" : "**não**"}, ${tira.rodape}px do rodapé, ` +
          `colide com a manchete ${tira.colideComManchete ? "**sim**" : "não"}`,
      );
      if (tira.texto !== atribuicaoReal) problemas.push("o texto da tira não é o crédito montado");
      if (!tira.dentroDaPeca) problemas.push("a tira de crédito está fora do quadro da peça");
      if (tira.colideComManchete) problemas.push("a tira de crédito colide com a manchete");
      if (tira.corpo < 14) problemas.push(`crédito em ${tira.corpo}px é ilegível`);
    }
  } finally {
    await navegador2.close();
  }

  linhas.push("", "## Veredicto", "");
  if (problemas.length === 0) {
    linhas.push(`Nenhum problema em ${artes.length} extremos. PNGs em \`${saida}\`.`);
  } else {
    for (const p of problemas) linhas.push(`- ${p}`);
  }

  const texto = linhas.join("\n");
  fs.writeFileSync(path.join(saida, "relatorio.md"), texto, "utf-8");
  console.log(texto);
  if (problemas.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
