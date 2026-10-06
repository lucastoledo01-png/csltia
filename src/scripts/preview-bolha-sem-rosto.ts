/**
 * Renderiza a bolha sem rosto com fotos reais, para OLHAR antes de publicar.
 *
 * O caso que motivou a regra (06/10/2026) é o retrato oficial de Biden de
 * fundo, com a bolha em cima da metade do rosto. Nenhum teste mostra isso: a
 * conta do círculo contra a caixa pode estar certa e a caixa do detector,
 * errada. Por isso este script usa a detecção DE VERDADE (uma chamada de
 * modelo por foto, uns centavos no total), o render de verdade (o mesmo
 * `renderizarCapas` da produção, com a medida do círculo na página) e as fotos
 * que a produção usou, lidas sem escrever nada no banco.
 *
 * Para cada peça saem dois arquivos: a peça como iria ao ar, e a conferência,
 * com as caixas dos rostos em vermelho (a linha tracejada é a folga), as
 * posições candidatas em branco e a escolhida em verde. Onde a regra mudou a
 * peça, sai também o "antes", com a posição fixa de sempre em laranja.
 *
 * Uso: npx tsx src/scripts/preview-bolha-sem-rosto.ts [pasta de saída]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderizarCapas } from "@/lib/server/social/arte";
import { decidirBolha, FOLGA_DO_ROSTO, type DecisaoDaBolha } from "@/lib/server/social/bolha-sem-rosto";
import { detectarRostos } from "@/lib/server/visual/rostos-na-foto";
import { CANVAS_DO_FEED, POSICOES_DA_BOLHA, circuloDaPosicao, posicaoPorChave } from "@/lib/carousel-templates/bolha";
import type { CaixaNormalizada } from "@/lib/carousel-templates/bolha";

for (const arquivo of [".env.local", ".env"]) {
  if (!fs.existsSync(arquivo)) continue;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SAIDA = process.argv[2] || path.join("docs", "design", "bolha-sem-rosto-2026-10-06");
fs.mkdirSync(SAIDA, { recursive: true });

const COMMONS = "https://upload.wikimedia.org/wikipedia/commons";

type Peca = {
  nome: string;
  headline: string;
  eixo: string;
  fundo: string;
  segunda: string | null;
  /** Mostra também a peça como sairia ANTES, na posição fixa. */
  comAntes?: boolean;
};

type Cenario = { titulo: string; anteriorTeveBolha: boolean; pecas: Peca[] };

const CENARIOS: Cenario[] = [
  {
    titulo: "Retrato com rosto no centro: a posição de sempre cruzaria o rosto",
    anteriorTeveBolha: false,
    pecas: [
      {
        nome: "01-rosto-no-centro",
        headline: "Onda migratória de Biden impulsionou o crescimento e afetou pouco trabalhadores nascidos nos EUA",
        eixo: "economia",
        fundo: `${COMMONS}/a/a9/Joe_Biden_kickoff_rally_May_2019.jpg`,
        segunda: `${COMMONS}/6/68/Joe_Biden_presidential_portrait.jpg`,
        comAntes: true,
      },
    ],
  },
  {
    titulo: "Paisagem sem rosto: a bolha fica onde sempre ficou",
    anteriorTeveBolha: false,
    pecas: [
      {
        nome: "02-paisagem-sem-rosto",
        headline: "Quem dá acesso total ao disco no Mac terá controles mais explícitos à medida que agentes ganham autonomia",
        eixo: "tecnologia",
        fundo: `${COMMONS}/e/eb/Apple_park_cupertino_2019.jpg`,
        segunda: `${COMMONS}/e/ec/Apple-Park_Cupertino_1254.jpg`,
      },
    ],
  },
  {
    titulo: "O caso real de 29/09/2026: retrato oficial de Biden, nenhuma posição livre",
    anteriorTeveBolha: false,
    pecas: [
      {
        nome: "03-sem-posicao-livre",
        headline: "Onda migratória de Biden impulsionou o crescimento e afetou pouco trabalhadores nascidos nos EUA",
        eixo: "economia",
        fundo: `${COMMONS}/6/68/Joe_Biden_presidential_portrait.jpg`,
        segunda: `${COMMONS}/a/a9/Joe_Biden_kickoff_rally_May_2019.jpg`,
        comAntes: true,
      },
    ],
  },
  {
    titulo: "Alternância em três posts seguidos: a vez passa quando não se cumpre",
    anteriorTeveBolha: false,
    pecas: [
      {
        nome: "04a-alternancia-vez-sem-lugar",
        headline: "Agências federais deixariam de usar leitores de placas em projeto apresentado por Sanders",
        eixo: "seguranca",
        fundo: `${COMMONS}/2/2e/Bernie_Sanders_2023.jpg`,
        segunda: `${COMMONS}/d/d7/Senator_Bernie_Sanders_speaking_at_LA_Fighting_Oligarchy_Tour_rally.jpg`,
      },
      {
        nome: "04b-alternancia-vez-herdada",
        headline: "Motorista tem direitos violados em busca sem mandado no Flock, decide juiz federal em Oklahoma",
        eixo: "seguranca",
        fundo: `${COMMONS}/9/9b/Close_up_of_Flock_camera.jpg`,
        segunda: `${COMMONS}/1/15/Flock_Safety_License_Plate_Reader_Camera_in_Colorado_%2855307233186%29.jpg`,
      },
      {
        nome: "04c-alternancia-depois-da-bolha",
        headline: "Emprego nos EUA muda pouco e taxa de desemprego fica em 4,2% em setembro",
        eixo: "economia",
        fundo: `${COMMONS}/d/db/New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg`,
        segunda: `${COMMONS}/c/c8/New_York_Stock_Exchange_Building_2010.jpg`,
      },
    ],
  },
];

/** As caixas, as candidatas e a escolhida, desenhadas por cima da peça. */
async function conferencia(
  peca: Buffer,
  rostos: CaixaNormalizada[],
  escolhida: string | null,
  cor = "#22c55e",
): Promise<Buffer> {
  const { width: W, height: H } = CANVAS_DO_FEED;
  const folga = FOLGA_DO_ROSTO * W;
  const formas: string[] = [];
  for (const p of POSICOES_DA_BOLHA) {
    const c = circuloDaPosicao(p, CANVAS_DO_FEED);
    const eh = p.chave === escolhida;
    formas.push(
      `<circle cx="${c.cx}" cy="${c.cy}" r="${c.raio}" fill="none" stroke="${eh ? cor : "rgba(255,255,255,0.55)"}"` +
        ` stroke-width="${eh ? 8 : 2}"${eh ? "" : ' stroke-dasharray="10 8"'} />`,
    );
  }
  for (const r of rostos) {
    const x = r.x * W;
    const y = r.y * H;
    const w = r.largura * W;
    const h = r.altura * H;
    formas.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(239,68,68,0.18)" stroke="#ef4444" stroke-width="5" />`);
    formas.push(
      `<rect x="${x - folga}" y="${y - folga}" width="${w + 2 * folga}" height="${h + 2 * folga}" fill="none" ` +
        `stroke="#ef4444" stroke-width="2" stroke-dasharray="12 8" />`,
    );
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${formas.join("")}</svg>`);
  return sharp(peca).resize(W, H).composite([{ input: svg }]).jpeg({ quality: 78 }).toBuffer();
}

async function principal() {
  const relatorio: Array<Record<string, unknown>> = [];
  let custo = 0;

  for (const cenario of CENARIOS) {
    console.log(`\n== ${cenario.titulo}`);
    let anterior = cenario.anteriorTeveBolha;

    for (const peca of cenario.pecas) {
      const { decisao, asset } = await decidirBolha({
        moldeLigado: true,
        anteriorTeveBolha: anterior,
        gramatica: "jornal",
        fotoDeFundo: peca.fundo,
        segundaFoto: peca.segunda ? { imageUrl: peca.segunda, attribution: "" } : null,
        canvas: CANVAS_DO_FEED,
        detectar: (url) => detectarRostos(url),
      });
      custo += decisao.custoUsd;

      /*
       * Os rostos são perguntados mesmo fora da vez, só para a conferência
       * desenhar as caixas. A produção não faz isso: fora da vez ela não paga.
       */
      let rostos: CaixaNormalizada[] = decisao.rostos ?? [];
      if (!decisao.rostos) {
        const r = await detectarRostos(peca.fundo);
        if (r.ok) rostos = r.rostos;
      }

      const entradas = [
        {
          headline: peca.headline,
          eixo: peca.eixo,
          asset: { imageUrl: peca.fundo, attribution: "" },
          assetSecundario: asset,
          posicaoDaBolha: decisao.posicao ?? undefined,
          rostosDaBolha: decisao.rostos ?? undefined,
        },
      ];
      if (peca.comAntes && peca.segunda) {
        // Como a peça sairia antes desta regra: posição fixa, ninguém olhando.
        entradas.push({
          headline: peca.headline,
          eixo: peca.eixo,
          asset: { imageUrl: peca.fundo, attribution: "" },
          assetSecundario: { imageUrl: peca.segunda, attribution: "" },
          posicaoDaBolha: undefined,
          rostosDaBolha: undefined,
        });
      }

      const [arte, antes] = await renderizarCapas(entradas);
      const desenhada = arte.bolha.desenhada;
      anterior = decisao.resultado === "com_bolha" && desenhada;

      fs.writeFileSync(path.join(SAIDA, `${peca.nome}.jpg`), arte.jpeg);
      fs.writeFileSync(
        path.join(SAIDA, `${peca.nome}-conferencia.jpg`),
        await conferencia(arte.jpeg, rostos, desenhada ? decisao.posicao : null),
      );
      if (antes) {
        fs.writeFileSync(
          path.join(SAIDA, `${peca.nome}-antes.jpg`),
          // Em laranja: é a posição fixa de antes, e não uma escolha.
          await conferencia(antes.jpeg, rostos, "padrao", "#f59e0b"),
        );
      }

      const linha = {
        peca: peca.nome,
        vez: decisao.vez,
        resultado: decisao.resultado,
        motivo: decisao.motivo,
        rostos: decisao.rostos ?? rostos,
        posicao: decisao.posicao,
        posicoesRecusadas: decisao.posicoesRecusadas,
        bolhaNoRender: arte.bolha,
        custoUsd: Number(decisao.custoUsd.toFixed(5)),
      } satisfies Record<string, unknown> & Partial<DecisaoDaBolha>;
      relatorio.push(linha);
      const medida = arte.bolha.medida;
      console.log(
        `${peca.nome}: ${decisao.resultado} ${decisao.posicao ?? ""} | rostos ${JSON.stringify(rostos)} | ` +
          `render: ${desenhada ? `desenhada em ${medida?.posicao} (${Math.round(medida?.cx ?? 0)}, ${Math.round(medida?.cy ?? 0)}, r ${Math.round(medida?.raio ?? 0)})` : `sem bolha ${arte.bolha.motivo}`}` +
          ` | marca: ${posicaoPorChave(decisao.posicao)?.chave ?? "-"}`,
      );
    }
  }

  fs.writeFileSync(path.join(SAIDA, "decisoes.json"), JSON.stringify({ custoUsd: Number(custo.toFixed(5)), pecas: relatorio }, null, 2) + "\n");
  console.log(`\ncusto da detecção: ${custo.toFixed(4)} USD; saída em ${SAIDA}`);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
