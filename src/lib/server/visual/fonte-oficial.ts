import type { AssetVisual, EntidadeVisual } from "./tipos";
import { avaliarLicenca, montarAtribuicao } from "./licencas";
import { agenteDaWikimedia } from "./wikidata";

/**
 * Imagem no site da própria entidade.
 *
 * A regra que manda aqui é sua e é a certa: domínio governamental não é
 * licença. Um `.gov` publica foto de agência, de contratado e de banco pago
 * junto com a foto que ele mesmo produziu, e a página raramente diz qual é
 * qual de um jeito legível por máquina.
 *
 * Então este módulo só aceita quando a página DECLARA o direito de reuso, em
 * texto. Silêncio é recusa. Na prática isso recusa a maioria, e é o resultado
 * correto: a alternativa seria publicar foto de terceiro apostando que ninguém
 * repara.
 *
 * O endereço não é adivinhado: vem do Wikidata (P856), o site oficial que a
 * própria entidade declara.
 */

const TEMPO_LIMITE_MS = 12_000;
const MAXIMO_DE_HTML = 800_000;

/** Caminhos onde instituição costuma publicar material para imprensa. */
const CAMINHOS_DE_IMPRENSA = ["", "/newsroom", "/news", "/press", "/media", "/press-kit", "/media-kit"];

/**
 * Declarações que valem como permissão.
 *
 * Cada uma é uma frase que a própria página escreve. Nenhuma delas é inferida
 * do domínio.
 */
const DECLARACOES: Array<{ padrao: RegExp; nome: string }> = [
  { padrao: /public domain|dom[íi]nio p[úu]blico/i, nome: "Public Domain" },
  {
    padrao: /work(s)? (of|prepared by) (the )?(u\.?s\.?|united states) (federal )?government|not subject to copyright protection/i,
    nome: "PD-USGov",
  },
  { padrao: /free (of charge )?(to|for) (use|reuse|republish)|may be (freely )?(used|reproduced|republished)/i, nome: "Reuso declarado" },
  { padrao: /creative commons|cc[ -]by/i, nome: "Creative Commons" },
  { padrao: /licen[çc]a creative commons|reprodu[çc][ãa]o (livre|permitida)/i, nome: "Reuso declarado" },
];

export type ResultadoOficial = {
  assets: AssetVisual[];
  /** O que foi tentado e o que cada tentativa disse. */
  notas: string[];
};

export async function buscarEmFonteOficial(
  entidade: EntidadeVisual,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; comPressKit?: boolean } = {}
): Promise<ResultadoOficial> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const notas: string[] = [];

  if (!entidade.siteOficial) {
    return { assets: [], notas: ["entidade não declara site oficial no Wikidata"] };
  }

  const caminhos = opcoes.comPressKit ? CAMINHOS_DE_IMPRENSA : [""];
  const assets: AssetVisual[] = [];

  for (const caminho of caminhos) {
    let alvo: URL;
    try {
      alvo = new URL(caminho, entidade.siteOficial);
    } catch {
      continue;
    }

    try {
      const resposta = await fetcher(alvo, {
        headers: { "User-Agent": agenteDaWikimedia(env), Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });

      if (!resposta.ok) {
        notas.push(`${alvo.pathname || "/"}: HTTP ${resposta.status}`);
        continue;
      }

      const html = (await resposta.text()).slice(0, MAXIMO_DE_HTML);
      const declaracao = DECLARACOES.find((d) => d.padrao.test(html));

      if (!declaracao) {
        notas.push(`${alvo.pathname || "/"}: sem declaração de direitos na página, recusado`);
        continue;
      }

      const imagem = extrairImagemPrincipal(html, alvo);
      if (!imagem) {
        notas.push(`${alvo.pathname || "/"}: declara "${declaracao.nome}" mas não expõe imagem utilizável`);
        continue;
      }

      const veredicto = avaliarLicenca(declaracao.nome, env);
      if (!veredicto.aceita) {
        notas.push(`${alvo.pathname || "/"}: declaração "${declaracao.nome}" fora da allowlist`);
        continue;
      }

      const agora = new Date().toISOString();
      assets.push({
        entityName: entidade.nome,
        entityNormalized: entidade.normalizado,
        entityType: entidade.tipo,
        source: caminho === "" ? "fonte_oficial" : "press_kit",
        sourceAssetId: imagem,
        imageUrl: imagem,
        sourcePageUrl: alvo.toString(),
        author: entidade.nome,
        license: veredicto.nome,
        licenseUrl: alvo.toString(),
        attribution: montarAtribuicao({
          autor: entidade.nome,
          fonte: alvo.hostname,
          licenca: veredicto.nome,
          exigeAtribuicao: veredicto.exigeAtribuicao,
        }),
        rightsStatement: declaracao.nome,
        rightsStatus: "verified",
        rightsCheckedAt: agora,
        sourceLastCheckedAt: agora,
        // Sem baixar o arquivo não dá para saber a dimensão. Fica zero, e a
        // pontuação trata zero como qualidade desconhecida.
        width: 0,
        height: 0,
        mimeType: "",
        storagePath: null,
        perceptualHash: null,
        imageRelevanceScore: 0,
        // Página institucional entrega imagem da instituição, não do fato.
        imageContextType: entidade.tipo === "place" ? "place" : "institution",
        metadata: { declaracao: declaracao.nome, pagina: alvo.toString() },
      });

      notas.push(`${alvo.pathname || "/"}: declara "${declaracao.nome}", 1 imagem`);
    } catch (erro) {
      notas.push(`${alvo.pathname || "/"}: ${(erro as Error).message}`);
    }
  }

  return { assets, notas };
}

/** A imagem que a página aponta como sua. */
function extrairImagemPrincipal(html: string, base: URL): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

  const bruto = og?.[1];
  if (!bruto) return null;

  try {
    const url = new URL(bruto, base);
    return /\.(jpe?g|png|webp)(\?|$)/i.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}
