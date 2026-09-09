import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { criarSocialPostsStore } from "../lib/server/social/social-posts-store";
import type { PostParaGravar } from "../lib/server/social/social-posts-store";
import { ehSocialV2, lerCargaV2 } from "../lib/server/social/instagram/carga-v2";
import { verificarArtefato } from "../lib/server/social/instagram/worker-v2";
import { congelarArtefato } from "../lib/server/social/artefato";
import { escreverRelatorio } from "./relatorio";

/**
 * Do pipeline ao worker, provando que nada foi reescrito no caminho.
 *
 * A pergunta que esta simulação responde é estreita e é a que decide o
 * rollout: o que o worker manda para a Meta é, byte a byte, o que o Social
 * Guard aprovou? "Olhei e parece igual" não responde. Hash responde.
 *
 * Três decisões de método:
 *
 *   1. Nada é gravado em `social_posts`. O store roda contra um Supabase de
 *      mentira em memória, que guarda a linha exatamente como o `upsert` a
 *      montaria. Gravar de verdade deixaria registro de teste elegível para o
 *      worker de produção pegar, que é o oposto do que se quer provar.
 *
 *   2. A Meta não é chamada. A simulação para na fronteira: monta a arte,
 *      calcula o que iria no container, e compara. Publicar não faz parte da
 *      pergunta.
 *
 *   3. A arte é renderizada DUAS vezes com o mesmo insumo, e os dois PNGs são
 *      comparados por hash. É o que separa "determinístico" de "parece
 *      estável": se o mesmo insumo desse peças diferentes, re-renderizar na
 *      publicação seria inseguro por construção, e a arte teria que ser
 *      persistida como arquivo.
 *
 *   npx tsx src/scripts/simular-worker-v2.ts --saida=/tmp/simulacao-v2.md
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

const sha = (v: string | Buffer) => crypto.createHash("sha256").update(v).digest("hex").slice(0, 16);

/**
 * Supabase de mentira: guarda as linhas do upsert e não fala com a rede.
 *
 * `.eq()` devolve a si mesmo quantas vezes for chamado, e o encadeamento
 * termina quando alguém dá `await` — por isso o objeto tem `then`. Sem isso, a
 * primeira mudança na quantidade de filtros do store quebraria o dublê, e a
 * simulação passaria a testar o dublê em vez do código.
 */
function bancoEmMemoria() {
  const linhas: Array<Record<string, unknown>> = [];

  const consulta = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.in = () => q;
    q.then = (resolver: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolver);
    return q;
  };

  const client = {
    from: () => ({
      select: () => consulta(),
      upsert: (novas: Array<Record<string, unknown>>) => {
        const inicio = linhas.length;
        linhas.push(...novas);
        return {
          select: async () => ({
            data: novas.map((_, i) => ({ id: `simulado-${inicio + i}` })),
            error: null,
          }),
        };
      },
    }),
  } as never;

  return { client, linhas };
}

const DIA = "2026-09-06";
const PROJ = "projeto-simulado";

/**
 * Os dois casos que o rollout precisa cobrir.
 *
 * A copy e a foto são fixas de propósito: a simulação testa o TRÂNSITO do dado
 * pelo worker, não a qualidade da redação. Chamar o modelo aqui trocaria uma
 * prova determinística por uma amostra.
 */
function casos(): Array<{ nome: string; post: PostParaGravar }> {
  const base = (over: Record<string, unknown>, visual: unknown): PostParaGravar =>
    ({
      projectId: PROJ,
      editionDate: DIA,
      candidateId: "cand-1",
      topicId: "org:uscis",
      eventFingerprint: "uscis+prazo+i765",
      origem: { originChannel: "social", originStoryId: null, motivo: "aprovada e verificada" },
      vaga: { posicao: 1, slot: `${DIA}-01`, quandoIso: `${DIA}T11:00:00Z`, horaLocal: "08:00" },
      visual,
      post: {
        pauta: {
          storyId: "s-simulado",
          pontuacao: { total: 71 },
          classificacao: { eixo: "processo" },
        },
        copy: {
          headline: "USCIS muda prazo de análise do I-765",
          gancho: "A mudança vale a partir de outubro.",
          corpo: "O prazo passa de 90 para 45 dias.",
          cta: "Comente VISA e receba a avaliação no Direct.",
          hashtags: ["#USCIS", "#I765"],
        },
        veredicto: {
          passed: true,
          issues: [],
          repairableIssues: [],
          fatalIssues: [],
          attempts: 0,
          finalDecision: "publicar",
          legendaFinal:
            "A mudança vale a partir de outubro.\n\nO prazo passa de 90 para 45 dias.\n\n" +
            "Comente VISA e receba a avaliação no Direct.\n\n#USCIS #I765 #Imigracao #EstadosUnidos",
          hashtagsFinais: ["#USCIS", "#I765", "#Imigracao", "#EstadosUnidos"],
        },
        tentativas: 0,
        tokens: 0,
        custoUsd: 0,
        reparosAplicados: [],
      },
      ...over,
    }) as unknown as PostParaGravar;

  return [
    {
      nome: "brand card (capa de texto, sem foto aprovada)",
      post: base({}, { motivo: "NO_VALID_IMAGE", asset: null, entidade: { nome: "USCIS" }, fontesConsultadas: [] }),
    },
    {
      nome: "post com foto (Commons, CC BY-SA, crédito impresso)",
      post: base(
        {},
        {
          motivo: "",
          asset: {
            id: "asset-simulado",
            source: "wikimedia_commons",
            sourceAssetId: "File:Jamaica Av 153rd St td (2022-04-11) 02 - USCIS Application Support Center.jpg",
            sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Jamaica_Av_153rd_St_td_(2022-04-11)_02_-_USCIS_Application_Support_Center.jpg",
            author: "Tdorante10",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
            attribution: "Foto: Tdorante10 / Wikimedia Commons / CC BY-SA 4.0",
            rightsStatement: "",
            rightsStatus: "verified",
            rightsCheckedAt: `${DIA}T10:00:00Z`,
            /*
             * Arquivo real do Commons, com licença que EXIGE atribuição, para
             * a tira de crédito ter que ser desenhada.
             *
             * A URL é a canônica de `upload.wikimedia.org`. A primeira volta
             * desta simulação usou uma que eu montei à mão e devolvia 400, e o
             * relatório acusou "a arte saiu sem a foto" — que era a guarda
             * fazendo o que devia, sobre um insumo meu que estava errado.
             */
            imageUrl:
              "https://upload.wikimedia.org/wikipedia/commons/6/6b/Jamaica_Av_153rd_St_td_%282022-04-11%29_02_-_USCIS_Application_Support_Center.jpg",
            imageContextType: "institution",
            assetDate: 2022,
            temporalRelevanceScore: 90,
            semanticContextFit: 88,
          },
        },
      ),
    },
  ];
}

async function main() {
  carregarEnv();
  const saida =
    process.argv.slice(2).find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/simulacao-v2.md";

  const linhas: string[] = [
    "# Social V2 do pipeline ao worker, sem Meta",
    "",
    "Nada foi gravado em `social_posts`: o store roda contra um Supabase em memória, e a linha",
    "conferida é exatamente a que o `upsert` montaria. Nenhuma chamada à Meta. Nenhum registro",
    "de teste elegível para o worker de produção.",
    "",
  ];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  const problemas: string[] = [];

  for (const caso of casos()) {
    escrever(`## ${caso.nome}`);
    escrever();

    // ---- 1. Congelar a peça, que é o que o pipeline faz antes de gravar --
    /*
     * O arquivo em memória, e não no Storage de produção.
     *
     * `subir` devolve uma URL de mentira e guarda os bytes; o `fetcher` da
     * verificação os devolve de volta. É o mesmo caminho de código do worker,
     * sem escrever no bucket e sem falar com a Meta.
     */
    const bucket = new Map<string, Buffer>();

    const congelado = await congelarArtefato({
      /*
       * Os insumos saem do POST, não de uma carga lida: neste ponto a linha
       * ainda não existe. É a mesma ordem do pipeline real — congelar primeiro,
       * gravar a linha apontando para o arquivo depois.
       */
      capa: {
        headline: caso.post.post.copy.headline,
        eixo: caso.post.post.pauta.classificacao.eixo,
        asset: (caso.post.visual as { asset?: { imageUrl: string; attribution: string } } | null)?.asset ?? null,
        motivoSemFoto:
          (caso.post.visual as { motivo?: string } | null)?.motivo || "NO_VALID_VISUAL_ASSET",
      },
      path: `imigra-us/${DIA}/simulado`,
      subir: async (bytes, caminho) => {
        bucket.set(caminho, bytes);
        return `memoria://${caminho}`;
      },
    });

    if (!congelado.ok) {
      escrever(`- congelamento: **FALHOU** — ${congelado.motivo}`);
      problemas.push(`${caso.nome}: ${congelado.motivo}`);
      escrever();
      continue;
    }

    const a = congelado.artefato;
    escrever(`- arquivo congelado: \`${a.filename}\` (${a.mime}), ${(a.bytes / 1024).toFixed(0)} KB, ${a.largura}x${a.altura}`);
    escrever(`- otimizado para caber no limite: ${a.otimizado ? "sim" : "não"}`);
    escrever(`- SHA-256 persistido: \`${a.sha256.slice(0, 32)}…\``);
    const fotoDoCaso = (caso.post.visual as { asset?: { attribution: string } } | null)?.asset ?? null;
    escrever(`- capa: ${fotoDoCaso ? "com foto" : "texto"}`);
    if (fotoDoCaso) escrever(`- crédito impresso: \`${fotoDoCaso.attribution}\``);

    const png = path.join(
      path.dirname(saida),
      `simulacao-${fotoDoCaso ? "com-foto" : "brand-card"}.${a.mime === "image/png" ? "png" : "jpg"}`,
    );
    fs.mkdirSync(path.dirname(png), { recursive: true });
    fs.writeFileSync(png, bucket.get(a.path)!);
    escrever(`- peça salva em \`${png}\``);

    // ---- 2. O pipeline persiste a linha apontando para o arquivo -------
    const { client, linhas: gravadas } = bancoEmMemoria();
    const r = await criarSocialPostsStore(client).gravar([{ ...caso.post, artefato: a }]);
    if (r.gravados !== 1) {
      problemas.push(`${caso.nome}: o store não gravou (${r.erros.join("; ") || "sem erro"})`);
      continue;
    }
    const linha = gravadas[0];

    const antes: Record<string, string | string[]> = {
      headline: String(linha.title),
      legenda: String(linha.caption),
      hashtags: ((linha.content_json as Record<string, unknown>).hashtags as string[]) ?? [],
      visual: JSON.stringify((linha.content_json as Record<string, unknown>).visual),
      arte: JSON.stringify((linha.content_json as Record<string, unknown>).arte),
    };

    escrever(`| campo | hash antes do worker |`);
    escrever(`| --- | --- |`);
    for (const [k, v] of Object.entries(antes)) {
      escrever(`| ${k} | \`${sha(typeof v === "string" ? v : JSON.stringify(v))}\` |`);
    }
    escrever();

    // ---- 2. O worker reconhece -------------------------------------
    const reconhecido = ehSocialV2(linha);
    escrever(`- \`generation_version\` = \`${String(linha.generation_version)}\``);
    escrever(`- o worker reconhece como social-v2: **${reconhecido ? "sim" : "NÃO"}**`);
    if (!reconhecido) problemas.push(`${caso.nome}: o worker não reconheceu a linha como social-v2`);

    const leitura = lerCargaV2(linha);
    if (!leitura.ok) {
      escrever(`- carga: **BLOQUEADA** — ${leitura.motivo}`);
      problemas.push(`${caso.nome}: carga considerada incompleta: ${leitura.faltando.join("; ")}`);
      escrever();
      continue;
    }
    escrever(`- carga: íntegra`);
    escrever();

    // ---- 4. O worker: ele não sabe desenhar, só conferir ---------------
    const storage = (conteudo: Buffer): typeof fetch =>
      (async () => new Response(new Uint8Array(conteudo), { status: 200 })) as unknown as typeof fetch;

    const verificado = await verificarArtefato(leitura.carga, {
      socialPostId: "simulado",
      fetcher: storage(bucket.get(a.path)!),
    });

    const intacto = verificado.sha256 === a.sha256;
    escrever(`- o worker baixou o artefato e conferiu: hash ${intacto ? "**igual**" : "**DIFERENTE**"}`);
    if (!intacto) problemas.push(`${caso.nome}: o hash mudou entre congelar e verificar`);

    /*
     * E o caso que prova a guarda existir: arquivo trocado no Storage. Sem
     * isto, "o hash bate" seria só uma tautologia com passos a mais.
     */
    let bloqueou = false;
    try {
      await verificarArtefato(leitura.carga, {
        socialPostId: "simulado",
        fetcher: storage(Buffer.from("ARQUIVO-TROCADO-POR-OUTRO")),
      });
    } catch (erro) {
      bloqueou = String((erro as Error).message).includes("SOCIAL_ARTIFACT_HASH_MISMATCH");
      escrever(`- arquivo adulterado no Storage: **bloqueado**`);
      escrever(`  \`${(erro as Error).message.slice(0, 130)}\``);
    }
    if (!bloqueou) problemas.push(`${caso.nome}: arquivo adulterado NÃO foi bloqueado`);
    escrever();

    const { carga } = leitura;

    // ---- 3. Nada foi reescrito -------------------------------------
    /*
     * O "depois" tem que sair do que o WORKER consumiu, não da linha.
     *
     * A primeira volta deste script comparava `visual` e `arte` com eles
     * mesmos: as duas colunas da tabela recebiam `antes.visual` e `antes.arte`,
     * e davam "igual" porque eram o mesmo objeto. Prova tautológica é pior que
     * prova nenhuma, porque parece uma.
     *
     * Agora os dois lados são reconstruídos a partir da carga que o worker leu:
     * a foto que ele vai desenhar e o eixo que ele vai imprimir. Se `lerCargaV2`
     * perder um campo no caminho, a comparação acusa.
     */
    const depois = {
      headline: carga.headline,
      legenda: carga.legenda,
      hashtags: carga.hashtags,
      visual: JSON.stringify(
        carga.foto
          ? { imageUrl: carga.foto.imageUrl, attribution: carga.foto.attribution }
          : { capa: "texto", motivo: carga.motivoSemFoto },
      ),
      arte: JSON.stringify({ eixo: carga.eixo }),
    };

    /*
     * E o "antes" dos dois campos derivados é extraído da linha do mesmo jeito,
     * para a comparação ser entre o que foi gravado e o que foi lido, e não
     * entre dois formatos diferentes do mesmo dado.
     */
    const visualDaLinha = (linha.content_json as Record<string, unknown>).visual as Record<string, unknown>;
    const arteDaLinha = (linha.content_json as Record<string, unknown>).arte as Record<string, unknown>;
    antes.visual = JSON.stringify(
      visualDaLinha.imageUrl
        ? { imageUrl: visualDaLinha.imageUrl, attribution: visualDaLinha.attribution ?? "" }
        : { capa: visualDaLinha.capa, motivo: visualDaLinha.motivo },
    );
    antes.arte = JSON.stringify({ eixo: arteDaLinha.eixo });

    escrever(`| campo | antes | depois | igual |`);
    escrever(`| --- | --- | --- | --- |`);
    const comoTexto = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
    const doDepois = depois as Record<string, unknown>;
    for (const k of Object.keys(antes)) {
      const a = comoTexto(antes[k]);
      const b = comoTexto(doDepois[k]);
      const igual = sha(a) === sha(b);
      escrever(`| ${k} | \`${sha(a)}\` | \`${sha(b)}\` | ${igual ? "sim" : "**NÃO**"} |`);
      if (!igual) problemas.push(`${caso.nome}: ${k} mudou entre o pipeline e o worker`);
    }
    escrever();

    escrever();
  }

  escrever(`## Veredicto`);
  escrever();
  if (problemas.length === 0) {
    escrever(`Nenhuma divergência. O que o worker publicaria é o que o pipeline aprovou.`);
  } else {
    for (const p of problemas) escrever(`- ${p}`);
  }

  escreverRelatorio(saida, linhas.join("\n"));
  if (problemas.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
