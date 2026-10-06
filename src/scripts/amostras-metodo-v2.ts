import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import { MARCA } from "../lib/marca";
import { chapeuDaPeca, renderizarCapas, type EntradaDaCapa } from "../lib/server/social/arte";
import { entradasDoCarrossel } from "../lib/server/social/carrossel/arte";
import { papeisPara } from "../lib/server/social/carrossel/estrutura";
import { podarMioloSemFoto } from "../lib/server/social/carrossel/fotos";
import type { CopyDoCarrossel } from "../lib/server/social/carrossel/copy";

/**
 * Amostras do método com a marca do Instagram, o chapéu por tema e o
 * carrossel sem slide sem foto (06/10/2026).
 *
 * Banco só LIDO: as capas são de posts publicados em `social_posts` (manchete,
 * legenda, foto e eixo como foram ao ar), desenhadas de novo pelo código
 * desta versão; o carrossel é o do ensaio de 06/10/2026
 * (`docs/design/metodo-carrossel-2026-10-06/sanders-flock/carrossel.json`),
 * com as fotos que o resolvedor escolheu na época. Nenhuma chamada de modelo,
 * nenhuma escrita, nenhum upload: o render é o de produção, e o PNG vai para a
 * pasta de amostras, reduzido a 1080 de largura.
 *
 * A marca do Instagram ainda não está no ar (o arquivo só existe depois do
 * deploy), então ela entra aqui como data URL do arquivo local. É o único
 * desvio do caminho de produção, e não muda o desenho.
 *
 *   npx tsx src/scripts/amostras-metodo-v2.ts
 */

const SAIDA = path.resolve(process.cwd(), "docs/design/metodo-carrossel-2026-10-06/v2");

const CAPAS = [
  // id do post publicado, e o que a amostra quer mostrar
  { id: "6eac531b-8a19-478a-836d-c1c2bbc4fafb", nome: "capa-emprego" },
  { id: "b97eb3b2-7d7e-45f8-86c1-97bd058dfad2", nome: "capa-flock" },
  { id: "6fe23f47-04f3-4a58-8537-1ca65650debc", nome: "capa-clima" },
  { id: "c97258f3-cc13-480e-b38a-2ca3a9e96a2e", nome: "capa-clima-tribunal" },
];

function dataUrl(arquivo: string): string {
  return `data:image/png;base64,${fs.readFileSync(path.resolve(process.cwd(), arquivo)).toString("base64")}`;
}

async function salvar(png: Buffer, nome: string): Promise<string> {
  const destino = path.join(SAIDA, `${nome}.png`);
  await sharp(png).resize({ width: 1080 }).png({ compressionLevel: 9 }).toFile(destino);
  return destino;
}

async function main(): Promise<void> {
  carregarEnv();
  fs.mkdirSync(SAIDA, { recursive: true });

  const marca = MARCA as unknown as Record<string, string>;
  marca.logoInstagramClaro = dataUrl("public/marca/eua-instagram-fundo-claro.png");
  marca.logoInstagramEscuro = dataUrl("public/marca/eua-instagram-fundo-escuro.png");
  marca.avatar = dataUrl("public/marca/eua-journal-avatar.png");

  const cliente = clienteDoBanco();
  const { data, error } = await cliente
    .from("social_posts")
    .select("id, title, caption, content_json")
    .in(
      "id",
      CAPAS.map((c) => c.id),
    );
  if (error) throw new Error(error.message);

  const entradas: EntradaDaCapa[] = [];
  const nomes: string[] = [];
  for (const c of CAPAS) {
    const linha = (data ?? []).find((l) => l.id === c.id);
    if (!linha) {
      console.log(`${c.nome}: post não encontrado`);
      continue;
    }
    const cj = (linha.content_json ?? {}) as Record<string, Record<string, unknown>>;
    const eixo = String(cj.arte?.eixo ?? "");
    const imageUrl = String(cj.visual?.imageUrl ?? "");
    const chapeu = chapeuDaPeca({ eixo, textos: [linha.title, linha.caption] });
    console.log(`${c.nome}: eixo ${eixo || "(nenhum)"}, chapéu "${chapeu}", foto ${imageUrl.slice(0, 80)}`);
    entradas.push({
      headline: String(linha.title ?? ""),
      eixo,
      chapeu,
      asset: { imageUrl, attribution: "" },
      gramatica: "jornal",
    });
    nomes.push(c.nome);
  }

  const capas = await renderizarCapas(entradas);
  for (const [i, arte] of capas.entries()) {
    console.log(`  ${await salvar(arte.png, nomes[i])} (${arte.largura}x${arte.altura})`);
    const marcaNoHtml = /data-brilho="([\d.]+)"/.exec(arte.html);
    if (marcaNoHtml) console.log(`  brilho atrás da marca: ${marcaNoHtml[1]}`);
  }

  // O carrossel de notícia completo, do ensaio de 06/10/2026.
  const ensaio = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "docs/design/metodo-carrossel-2026-10-06/sanders-flock/carrossel.json"), "utf-8"),
  ) as {
    headline: string;
    legenda: string;
    slides: CopyDoCarrossel["slides"];
    capa: string;
    fotos: string[];
    creditos: string[];
    pacote: { fatos: string[] };
  };
  const copy: CopyDoCarrossel = {
    headline: ensaio.headline,
    destaque: "",
    gancho: "",
    fato_principal: "",
    contexto: "",
    informacao_util: "",
    ressalva: "",
    cta: `Comente ${MARCA.keyword} e receba o link da newsletter no Direct.`,
    hashtags: [],
    slides: ensaio.slides,
  };
  const papeis = papeisPara("noticia", 5, true);
  const fotos = ensaio.fotos.map((u, i) => ({ imageUrl: u, attribution: ensaio.creditos[i + 1] ?? "" }));
  const poda = podarMioloSemFoto({ papeis, slides: copy.slides, fotos });
  if (poda.formato !== "carousel") throw new Error(`o carrossel do ensaio virou peça única: ${poda.motivo}`);
  const chapeu = chapeuDaPeca({ eixo: "politica", textos: [copy.headline, ensaio.legenda, ...ensaio.pacote.fatos] });
  console.log(`carrossel: ${poda.papeis.length} slides, chapéu "${chapeu}"`);

  const { entradas: doCarrossel } = entradasDoCarrossel({ ...copy, slides: poda.slides }, poda.papeis, {
    eixo: "politica",
    chapeu,
    asset: { imageUrl: ensaio.capa, attribution: ensaio.creditos[0] ?? "" },
    motivoSemFoto: "",
    gramatica: "jornal",
    fotosDoMiolo: poda.fotos,
    bolhasDoMiolo: poda.bolhas,
  });
  const slides = await renderizarCapas(doCarrossel);
  for (const [i, arte] of slides.entries()) {
    console.log(`  ${await salvar(arte.png, `carrossel-sanders-${String(i + 1).padStart(2, "0")}`)}`);
  }

  await folhaDeContato(
    slides.map((a) => a.png),
    "folha-carrossel-sanders",
  );

  /*
   * O mesmo carrossel com a foto do slide 3 faltando: o slide sai, e a peça
   * fica com quatro telas, sem nenhuma de texto sobre azul-marinho.
   */
  const semUma = podarMioloSemFoto({ papeis, slides: copy.slides, fotos: [fotos[0], null, fotos[2]] });
  if (semUma.formato !== "carousel") throw new Error("o podado devia continuar carrossel");
  console.log(`podado: ${semUma.papeis.length} slides, fora: ${semUma.tirados.join(", ")}`);
  const { entradas: doPodado } = entradasDoCarrossel({ ...copy, slides: semUma.slides }, semUma.papeis, {
    eixo: "politica",
    chapeu,
    asset: { imageUrl: ensaio.capa, attribution: ensaio.creditos[0] ?? "" },
    motivoSemFoto: "",
    gramatica: "jornal",
    fotosDoMiolo: semUma.fotos,
    bolhasDoMiolo: semUma.bolhas,
  });
  await folhaDeContato(
    (await renderizarCapas(doPodado)).map((a) => a.png),
    "folha-carrossel-sanders-sem-uma-foto",
  );
}

/** A peça inteira lado a lado, para ler o carrossel de uma vez. */
async function folhaDeContato(pngs: Buffer[], nome: string): Promise<void> {
  const largura = 360;
  const miniaturas = await Promise.all(pngs.map((p) => sharp(p).resize({ width: largura }).toBuffer()));
  const altura = (await sharp(miniaturas[0]).metadata()).height ?? 480;
  const destino = path.join(SAIDA, `${nome}.png`);
  await sharp({
    create: {
      width: largura * miniaturas.length + 16 * (miniaturas.length + 1),
      height: altura + 32,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(miniaturas.map((m, i) => ({ input: m, left: 16 + i * (largura + 16), top: 16 })))
    .png()
    .toFile(destino);
  console.log(`  ${destino}`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.stack : erro);
  process.exit(1);
});
