import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../lib/server/projects";
import {
  decisorDeFormato,
  pacotesDoEvergreen,
  prepararEvergreen,
  verificadorDeClaims,
} from "../lib/server/social/evergreen/ciclo";
import { rodarCicloSocial } from "../lib/server/social/pipeline-v2";
import type { PautaAvaliada } from "../lib/server/editorial/guarda";
import { carregarConfigSocial } from "../lib/server/social/selecao";
import { congelarArtefato, congelarCarrossel } from "../lib/server/social/artefato";
import { moldesLigados } from "../lib/server/social/moldes-do-feed";
import { resolveVisualAsset, buscarSegundaFoto } from "../lib/server/visual/resolver";
import { detectarRostos } from "../lib/server/visual/rostos-na-foto";
import type { SocialPostsStore, PostParaGravar } from "../lib/server/social/social-posts-store";
import type { UsoAnterior } from "../lib/server/social/evergreen/tipos";
import { CATALOGO_EVERGREEN } from "../lib/server/social/evergreen/catalogo";

/**
 * Amostras do evergreen de ponta a ponta, sem gravar nada em lugar nenhum.
 *
 * É o caminho de produção inteiro, e não o preview: lastro nas fontes
 * oficiais, cobertura, copy com Social Guard e reparo, verificação semântica,
 * foto de fora pelo resolvedor (em leitura), moldes do painel, ritmo e rostos
 * da bolha, e o render congelado. O que muda é só o fim: o store é de memória
 * e o "upload" escreve o arquivo na pasta de saída. Nenhuma linha em
 * `social_posts`, nenhum arquivo no Storage, nenhuma memória de foto marcada.
 *
 * O banco é LIDO para o projeto (marca, moldes) e para os tokens da arte.
 *
 *   npx tsx src/scripts/amostras-evergreen.ts --dias=2 --saida=docs/design/evergreen-novo-2026-10-06
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

function paraImagem(pauta: PautaAvaliada) {
  return {
    storyId: pauta.storyId,
    titulo: pauta.grupo.primary.title,
    resumo: pauta.enriquecimento?.texto ?? "",
    categoria: pauta.classificacao.eixo,
    classificacao: {
      atores: pauta.classificacao.atores,
      lugares: pauta.classificacao.lugares,
      acontecimento: pauta.classificacao.acontecimento,
      pais: pauta.classificacao.pais,
    },
  };
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const dias = Number(argv.find((a) => a.startsWith("--dias="))?.split("=")[1]) || 2;
  const saida = path.resolve(
    argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "docs/design/evergreen-novo-2026-10-06",
  );
  fs.mkdirSync(saida, { recursive: true });

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  /*
   * O ciclo em `enforce` só aqui dentro, para o caminho do congelamento rodar
   * de verdade. Quem impede a gravação é o store de memória, e quem impede o
   * upload é o `subir` local. O processo não toca o ambiente de ninguém.
   */
  const env = {
    ...process.env,
    SOCIAL_PIPELINE_V2: "enforce",
    VISUAL_RESOLVER_V2: "enforce",
    SOCIAL_V2_ENFORCE_LIBERADO: "true",
  };
  const configSocial = carregarConfigSocial(env);

  /*
   * `--itens=topico:angulo,...` restringe o catálogo a esses pares, para a
   * amostra cobrir editorias escolhidas. Sem ele, quem escolhe é a seleção de
   * verdade, na ordem em que ela giraria o catálogo.
   */
  const itens = (argv.find((a) => a.startsWith("--itens="))?.split("=")[1] ?? "").split(",").filter(Boolean);
  const catalogo = itens.length
    ? itens.map((par) => {
        const [topicoId, anguloId] = par.split(":");
        const topico = CATALOGO_EVERGREEN.find((t) => t.id === topicoId);
        const angulo = topico?.angulos.find((a) => a.id === anguloId);
        if (!topico || !angulo) throw new Error(`par fora do catálogo: ${par}`);
        return { ...topico, angulos: [angulo] };
      })
    : CATALOGO_EVERGREEN;
  const primeiroDia = argv.find((a) => a.startsWith("--primeiro-dia="))?.split("=")[1] ?? "2026-10-07";
  const historico: UsoAnterior[] = [];
  const fotosUsadas = new Set<string>();
  const linhas: string[] = ["# Amostras do evergreen novo", ""];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };
  let custo = { lastro: 0, copy: 0, bolha: 0 };
  const ultimas: Array<{ bolha: boolean; gramatica: string }> = [];

  for (let i = 0; i < dias; i += 1) {
    const dia = new Date(Date.parse(`${primeiroDia}T12:00:00Z`) + i * 86_400_000).toISOString().split("T")[0];
    const agoraMs = Date.parse(`${dia}T09:00:00Z`);
    const pasta = path.join(saida, dia);
    fs.mkdirSync(pasta, { recursive: true });

    // Zero notícia: o dia em que o evergreen mais trabalha, e o teto dele (2) é o que limita.
    const evergreen = await prepararEvergreen({
      projectId: project.id,
      noticiasNoDia: 0,
      maximoPorDia: configSocial.maximoPorDia,
      historico,
      agoraMs,
      modoForcado: "dry_run",
      catalogo,
      env,
      fetcher: fetch,
    });
    custo.lastro += evergreen.diagnostico.custoUsd;

    escrever(`## ${dia}`);
    escrever();
    escrever(
      `${evergreen.diagnostico.elegiveis} combinações elegíveis, ${evergreen.diagnostico.selecionados} selecionadas, ` +
        `${evergreen.diagnostico.comLastro} com lastro e cobertura.`,
    );
    for (const s of evergreen.diagnostico.semLastro) escrever(`- sem lastro: \`${s.item}\`: ${s.motivo}`);
    for (const s of evergreen.diagnostico.semCobertura) escrever(`- sem cobertura: \`${s.item}\`: ${s.motivo}`);
    escrever();
    if (evergreen.extras.length === 0) continue;

    const gravados: PostParaGravar[] = [];
    const store: SocialPostsStore = {
      doDia: async () => [],
      ultimasCapas: async () => [...ultimas].reverse(),
      gravar: async (posts) => {
        gravados.push(...posts);
        return { gravados: posts.length, bloqueadosPorIdempotencia: [], erros: [] } as never;
      },
    };
    const subirLocal = async (buffer: Buffer, destino: string) => {
      const nome = destino.split("/").slice(-2).join("__").replace(/[^a-zA-Z0-9_.-]/g, "-");
      const arquivo = path.join(pasta, nome);
      fs.writeFileSync(arquivo, buffer);
      return `file://${arquivo}`;
    };
    const opcoesDaImagem = {
      env,
      fetcher: fetch,
      somenteLeitura: true,
      jaUsadosNestaEdicao: fotosUsadas,
      jaUsadasRecentemente: [] as string[],
    };

    const ciclo = await rodarCicloSocial([], {
      projectId: project.id,
      moldes: moldesLigados(project),
      slugDoProjeto: project.slug,
      editionDate: dia,
      marca: {
        nome: project.brand.displayName || project.name,
        nicho: project.niche,
        extra: project.editorialPromptExtra ?? "",
        keyword: "",
      },
      historico: [],
      pacotes: pacotesDoEvergreen(evergreen.lastros),
      candidatas: evergreen.candidatas,
      store,
      config: configSocial,
      env,
      fetcher: fetch,
      agoraMs: Date.parse(`${dia}T03:00:00Z`),
      extras: evergreen.extras,
      decidirCarrossel: decisorDeFormato(evergreen.lastros),
      verificarClaims: verificadorDeClaims({ env, fetcher: fetch }),
      // Sem falar com o OpenReply: a palavra é a padrão da marca.
      resolverKeyword: async () => ({ ok: true as const, keyword: "NEWS", automacao: "amostra" }),
      congelarArte: (entrada) => congelarArtefato({ ...entrada, subir: subirLocal }),
      congelarCarrossel: (entrada) => congelarCarrossel({ ...entrada, subir: subirLocal }),
      resolverVisual: (pauta) => resolveVisualAsset(paraImagem(pauta), opcoesDaImagem),
      detectarRostos: (url) => detectarRostos(url, { env, fetcher: fetch }),
      buscarSegundaFoto: (pauta, visual) =>
        buscarSegundaFoto(paraImagem(pauta), visual.asset ?? { imageUrl: "" }, visual.entidade ?? null, opcoesDaImagem),
    });

    for (const l of ciclo.linhasDeLog) console.log(l);
    custo.bolha += ciclo.custoDaBolha?.usd ?? 0;
    for (const d of ciclo.descartados) escrever(`- descartado (${d.etapa}): ${d.titulo.slice(0, 80)}: ${d.motivo.slice(0, 200)}`);

    for (const g of gravados) {
      custo.copy += g.post.custoUsd ?? 0;
      ultimas.push({ bolha: g.bolha, gramatica: g.gramatica ?? "jornal" });
      if (g.visual?.asset?.imageUrl) fotosUsadas.add(g.visual.asset.imageUrl);
      const [, topico, angulo] = g.post.pauta.storyId.split(":");
      const c = g.post.carrossel;

      escrever(`### ${g.post.copy.headline}`);
      escrever();
      escrever(`- identidade: \`${g.post.pauta.storyId}\` (tópico ${topico}, ângulo ${angulo})`);
      escrever(`- editoria/eixo: ${g.post.pauta.classificacao.eixo}; imigração: ${g.post.pauta.classificacao.imigracao}`);
      escrever(`- formato: ${c ? `carrossel (${c.estrutura}), ${c.papeis.length} slides` : "peça única"}; gramática: ${g.gramatica}`);
      escrever(`- bolha: ${g.bolha ? "sim" : "não"} (${g.decisaoDaBolha?.resultado ?? "-"})`);
      escrever(
        `- foto: ${g.visual?.asset?.source ?? "-"} ${g.visual?.asset?.imageUrl ?? ""}` +
          (g.visual?.asset?.attribution ? ` (crédito: ${g.visual.asset.attribution})` : ""),
      );
      escrever(`- fontes: ${[g.post.pauta.grupo.primary.url, ...g.post.pauta.grupo.secondary_urls].join(" , ")}`);
      escrever(`- Social Guard: ${g.post.veredicto.finalDecision}, ${g.post.veredicto.issues.length} apontamento(s), ${g.post.reparosAplicados.length} reparo(s)`);
      escrever(`- arquivos: ${g.artefatos.map((a) => path.basename(a.url.replace("file://", ""))).join(", ")}`);
      escrever();
      escrever("Legenda:");
      escrever();
      escrever("```");
      escrever(g.legendaFinal ?? g.post.veredicto.legendaFinal);
      escrever("```");
      if (c) {
        escrever();
        escrever("Slides:");
        escrever();
        const doModelo = c.papeis.filter((x) => !x.escritoEmCodigo);
        c.papeis.forEach((papel, idx) => {
          if (papel.tipo === "cover") return escrever(`${idx + 1}. capa: ${g.post.copy.headline}`);
          if (papel.tipo === "cta") return escrever(`${idx + 1}. fechamento: ${g.post.copy.destaque || ""} / ${g.post.copy.cta}`);
          const t = c.slides[doModelo.indexOf(papel)];
          if (!t) return;
          const corpo = [t.corpo, ...(t.bullets ?? []), t.lado_a ? `A: ${t.lado_a}` : "", t.lado_b ? `B: ${t.lado_b}` : ""]
            .filter(Boolean)
            .join(" / ");
          escrever(`${idx + 1}. ${papel.papel}: **${t.titulo}** ${corpo}`);
        });
        const falhas = c.claims.filter((cl) => !cl.sustentada);
        escrever();
        escrever(`Claims conferidas: ${c.claims.length}, sem lastro: ${falhas.length}${c.removidos.length ? `; slides removidos: ${c.removidos.join(", ")}` : ""}`);
      }
      escrever();

      historico.push({
        storyId: g.post.pauta.storyId,
        topicId: g.post.pauta.storyId.split(":").slice(0, 2).join(":"),
        quandoIso: new Date(agoraMs).toISOString(),
      });
    }
  }

  const total = custo.lastro + custo.copy + custo.bolha;
  escrever("## Custo");
  escrever();
  escrever(
    `Lastro (pacote factual): US$ ${custo.lastro.toFixed(4)}; copy, reparo e auditoria: US$ ${custo.copy.toFixed(4)}; ` +
      `rostos e segunda foto da bolha: US$ ${custo.bolha.toFixed(4)}. Total medido: US$ ${total.toFixed(4)}. ` +
      `A descrição da cena e a conferência visual da foto não devolvem custo ao ciclo e não estão somadas.`,
  );
  const relatorio = path.join(saida, `amostras-${primeiroDia}.md`);
  fs.writeFileSync(relatorio, linhas.join("\n") + "\n", "utf-8");
  console.log(`\nAmostras em ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
