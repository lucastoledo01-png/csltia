import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../lib/server/projects";
import {
  decisorDeFormato,
  prepararEvergreen,
  pacotesDoEvergreen,
  verificadorDeClaims,
} from "../lib/server/social/evergreen/ciclo";
import { entradasDoCarrossel } from "../lib/server/social/carrossel/arte";
import { rodarCicloSocial } from "../lib/server/social/pipeline-v2";
import { carregarConfigSocial } from "../lib/server/social/selecao";
import { renderizarCapas } from "../lib/server/social/arte";
import { paginaDePreview } from "../lib/server/social/preview";
import type { PostDePreview } from "../lib/server/social/preview";
import type { UsoAnterior } from "../lib/server/social/evergreen/tipos";
import { escreverRelatorio } from "./relatorio";

/**
 * Três dias de feed permanente, para olhar cada dia como um conjunto.
 *
 * A pergunta que só o olho responde: isto parece um perfil editorial de
 * imigração, ou parece um glossário repetitivo? As métricas do dry-run de sete
 * dias dizem que a repetição não acontece e que o ritmo é sustentável. Elas não
 * dizem se o conjunto do dia tem cara de curadoria.
 *
 * Aqui o lastro é buscado de verdade nas fontes oficiais e a copy é escrita de
 * verdade: é o caminho completo, com Social Guard e reparo, e o único que
 * mostra o texto que iria ao ar. Nada é gravado nem publicado.
 *
 *   npx tsx src/scripts/preview-evergreen.ts --dias=3 --saida=/tmp/preview-evergreen
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

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const dias = Number(argv.find((a) => a.startsWith("--dias="))?.split("=")[1]) || 3;
  const saida = argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/preview-evergreen";
  fs.mkdirSync(saida, { recursive: true });

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const configSocial = carregarConfigSocial(process.env);

  const linhas: string[] = [`# Feed permanente, ${dias} dias`, ""];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  escrever(`Lastro buscado nas fontes oficiais. Copy escrita pelo caminho completo, com Social Guard e reparo.`);
  escrever(`Nada foi gravado, agendado ou publicado.`);
  escrever();

  const historico: UsoAnterior[] = [];
  let custoTotal = 0;

  for (let i = 0; i < dias; i += 1) {
    const dia = new Date(Date.UTC(2026, 8, 10 + i)).toISOString().split("T")[0];
    const agoraMs = Date.parse(`${dia}T09:00:00Z`);

    console.log(`\n=== ${dia} ===`);

    /*
     * Zero notícia de propósito: é o dia em que o evergreen mais tem valor, e
     * o que se quer ver aqui é o conjunto que ele sustenta sozinho.
     */
    const evergreen = await prepararEvergreen({
      projectId: project.id,
      noticiasNoDia: 0,
      maximoPorDia: configSocial.maximoPorDia,
      historico,
      agoraMs,
      modoForcado: "dry_run",
      env: process.env,
      fetcher: fetch,
    });

    custoTotal += evergreen.diagnostico.custoUsd;

    escrever(`## ${dia}`);
    escrever();
    escrever(
      `${evergreen.diagnostico.elegiveis} elegíveis, ${evergreen.diagnostico.selecionados} selecionados, ` +
        `${evergreen.diagnostico.comLastro} com lastro.`,
    );
    if (evergreen.diagnostico.semLastro.length > 0) {
      escrever();
      escrever(`Sem lastro, e por isso fora do dia:`);
      for (const s of evergreen.diagnostico.semLastro) escrever(`- \`${s.item}\`: ${s.motivo}`);
    }
    escrever();

    if (evergreen.extras.length === 0) {
      escrever(`Nenhum post. O catálogo não sustentou o dia, e isso é resultado.`);
      escrever();
      continue;
    }

    const ciclo = await rodarCicloSocial([], {
      projectId: project.id,
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
      extras: evergreen.extras,
      decidirCarrossel: decisorDeFormato(evergreen.lastros),
      /*
       * O verificador semântico roda de verdade no preview.
       *
       * É o que faz o preview valer como preview: se a auditoria não rodasse
       * aqui, o relatório mostraria posts aprovados por um caminho que a
       * produção não usaria.
       */
      verificarClaims: verificadorDeClaims({ env: process.env, fetcher: fetch }),
      config: configSocial,
      env: { ...process.env, SOCIAL_PIPELINE_V2: "dry_run" },
      fetcher: fetch,
      agoraMs: Date.parse(`${dia}T03:00:00Z`),
    });

    for (const l of ciclo.linhasDeLog) console.log(l);

    escrever(
      `| # | hora | origem | formato | slides | tópico | ângulo | content_type | claims | grounding | Guard | reparos | CTA |`,
    );
    escrever(`| --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- | --- | ---: | --- |`);
    for (const p of ciclo.previews) {
      const [, topico, angulo] = p.post.pauta.storyId.split(":");
      const c = p.post.carrossel;
      const claims = c?.claims ?? [];
      const falhas = claims.filter((cl) => !cl.sustentada).length;
      escrever(
        `| ${p.posicao} | ${p.vaga?.horaLocal ?? "?"} | ${p.origem.originChannel} | ` +
          `${c ? `**carousel** (${c.estrutura})` : "static"} | ${c ? c.papeis.length : 1} | ` +
          `${topico} | ${angulo} | ${p.post.pauta.grupo.primary.category} | ${claims.length} | ` +
          `${claims.length === 0 ? "sem claim" : falhas === 0 ? "**PASS**" : `**${falhas} FAIL**`} | ` +
          `${p.post.veredicto.finalDecision} | ` +
          `${p.post.reparosAplicados.length} | ${p.post.copy.cta ? "sim" : "**SEM_CTA**"} |`,
      );
    }
    escrever();

    for (const p of ciclo.previews) {
      escrever(`### ${p.post.copy.headline}`);
      escrever();
      escrever("```");
      escrever(p.post.veredicto.legendaFinal);
      escrever("```");
      escrever();
      escrever(`- identidade: \`${p.post.pauta.storyId}\``);
      escrever(`- fonte: ${p.post.pauta.grupo.primary.url}`);
      escrever(`- origem: **${p.origem.originChannel}**`);
      escrever(`- hashtags: ${p.post.veredicto.hashtagsFinais.join(" ")}`);
      escrever(`- Social Guard: ${p.post.veredicto.finalDecision}, ${p.post.veredicto.issues.length} issue(s)`);

      const c = p.post.carrossel;
      if (!c) {
        escrever(`- formato: **static**, 1 imagem`);
        escrever();
        continue;
      }

      escrever(`- formato: **carousel** (${c.estrutura}), ${c.papeis.length} slides`);
      if (c.removidos.length > 0) {
        escrever(`- slides removidos por claim sem lastro: ${c.removidos.join(", ")}`);
      }
      escrever();

      const pacote = pacotesDoEvergreen(evergreen.lastros).get(p.post.pauta.storyId);
      if (pacote) {
        escrever(
          `Pacote factual: ${pacote.verified_facts.length} fato(s), ` +
            `${pacote.numbers.length} número(s), ${pacote.gaps.length} lacuna(s).`,
        );
        escrever();
      }

      escrever(`Os slides, na ordem de leitura:`);
      escrever();
      escrever(`| # | papel | grounding | claims | título | conteúdo |`);
      escrever(`| ---: | --- | --- | --- | --- | --- |`);

      const doModelo = c.papeis.filter((x) => !x.escritoEmCodigo);
      const claimsDoSlide = (posicao: number) => c.claims.filter((cl) => cl.posicao === posicao);
      const grounding = (posicao: number) => {
        const claims = claimsDoSlide(posicao);
        if (claims.length === 0) return "sem claim";
        return claims.every((cl) => cl.sustentada) ? "**PASS**" : "**FAIL**";
      };
      const listarClaims = (posicao: number) =>
        claimsDoSlide(posicao)
          .map((cl) => `${cl.sustentada ? "ok" : "FALHOU"} [${cl.tipo}] "${cl.trecho.slice(0, 60)}"`)
          .join(" / ")
          .replace(/\|/g, "\\|") || "-";

      c.papeis.forEach((papel, i) => {
        if (papel.tipo === "cover") {
          escrever(
            `| ${i + 1} | capa (código) | ancorada na manchete | - | ${p.post.copy.headline} | a manchete é a arte |`,
          );
          return;
        }
        if (papel.tipo === "cta") {
          escrever(
            `| ${i + 1} | fechamento (código) | texto já ancorado | - | ${p.post.copy.destaque || "-"} | ${p.post.copy.cta} |`,
          );
          return;
        }
        const texto = c.slides[doModelo.indexOf(papel)];
        if (!texto) return;
        const conteudo = [
          texto.corpo,
          ...(texto.bullets ?? []),
          texto.lado_a ? `A: ${texto.lado_a}` : "",
          texto.lado_b ? `B: ${texto.lado_b}` : "",
        ]
          .filter(Boolean)
          .join(" / ")
          .replace(/\|/g, "\\|");
        escrever(
          `| ${i + 1} | ${papel.papel} | ${grounding(i + 1)} | ${listarClaims(i + 1)} | ` +
            `${texto.titulo.replace(/\|/g, "\\|")} | ${conteudo} |`,
        );
      });
      escrever();
    }

    /* A arte de cada post, para o dia poder ser olhado como conjunto. */
    const pasta = path.join(saida, dia);
    fs.mkdirSync(pasta, { recursive: true });

    /*
     * Uma chamada de render para o dia inteiro, capas e slides juntos.
     *
     * `renderizarCapas` sobe UM navegador e reusa UMA página para toda a lista.
     * Chamá-la por post subiria um Chromium por post, e num dia de quatro
     * carrosséis isso é quatro navegadores para desenhar vinte peças.
     */
    const porPost = ciclo.previews.map((p) => {
      const c = p.post.carrossel;
      if (!c) {
        return {
          papeis: [] as Array<{ papel: string }>,
          entradas: [
            {
              headline: p.post.copy.headline,
              eixo: p.post.pauta.classificacao.eixo,
              asset: p.visual?.asset ?? null,
              motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
            },
          ],
        };
      }

      const montado = entradasDoCarrossel({ ...p.post.copy, slides: c.slides }, c.papeis, {
        eixo: p.post.pauta.classificacao.eixo ?? "",
        asset: p.visual?.asset ?? null,
        motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
      });
      return { papeis: c.papeis, entradas: montado.entradas };
    });

    const artes = await renderizarCapas(
      porPost.flatMap((x) => x.entradas),
      { fetcher: fetch },
    );

    /* De volta ao dono: a lista plana virou uma fatia por post. */
    const fatias: Array<typeof artes> = [];
    let cursor = 0;
    for (const x of porPost) {
      fatias.push(artes.slice(cursor, cursor + x.entradas.length));
      cursor += x.entradas.length;
    }

    const posts: PostDePreview[] = ciclo.previews.map((p, idx) => {
      const fatia = fatias[idx] ?? [];
      const arte = fatia[0];
      const nome = `post-${String(p.posicao).padStart(2, "0")}.png`;
      if (arte) fs.writeFileSync(path.join(pasta, nome), arte.png);

      const demais = fatia.slice(1).map((a, i) => {
        const arquivo = `post-${String(p.posicao).padStart(2, "0")}-slide-${String(i + 2).padStart(2, "0")}.png`;
        fs.writeFileSync(path.join(pasta, arquivo), a.png);
        return {
          arte: `data:image/jpeg;base64,${a.jpeg.toString("base64")}`,
          arquivo,
          papel: porPost[idx].papeis[i + 1]?.papel ?? `slide ${i + 2}`,
        };
      });

      const [, topico, angulo] = p.post.pauta.storyId.split(":");

      return {
        posicao: p.posicao,
        hora: p.vaga?.horaLocal ?? "?",
        headline: p.post.copy.headline,
        legenda: p.post.veredicto.legendaFinal,
        hashtags: p.post.veredicto.hashtagsFinais,
        /* Embutida: a página vale sozinha, mandada por mensagem ou aberta de outra pasta. */
        arte: arte ? `data:image/jpeg;base64,${arte.jpeg.toString("base64")}` : "",
        slides: demais,
        arquivo: nome,
        comFoto: Boolean(p.visual?.asset),
        motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
        diagnostico: [
          { campo: "origem", valor: p.origem.originChannel },
          {
            campo: "formato",
            valor: p.post.carrossel
              ? `carousel (${p.post.carrossel.estrutura}), ${p.post.carrossel.papeis.length} slides`
              : "static, 1 imagem",
          },
          { campo: "tópico", valor: topico },
          { campo: "ângulo", valor: angulo },
          { campo: "família", valor: p.post.pauta.grupo.primary.category },
          { campo: "fonte canônica", valor: p.post.pauta.grupo.primary.url.slice(0, 70) },
          {
            campo: "Social Guard",
            valor: `${p.post.veredicto.finalDecision}, ${p.post.veredicto.issues.length} issue(s)`,
            alerta: p.post.veredicto.issues.length > 0,
          },
          { campo: "reparos", valor: String(p.post.reparosAplicados.length) },
          { campo: "CTA", valor: p.post.copy.cta || "SEM_CTA", alerta: !p.post.copy.cta },
        ],
        recusadosVisuais: [],
      };
    });

    const html = paginaDePreview({
      dia,
      projeto: project.slug,
      alvo: configSocial.alvoPorDia,
      maximo: configSocial.maximoPorDia,
      posts,
      descartes: Object.entries(evergreen.diagnostico.cortadosPorMotivo).map(([motivo, quantas]) => ({
        etapa: "evergreen",
        motivo,
        quantas,
      })),
      observacoes: [
        `Dia simulado sem notícia, para ver o conjunto que o conteúdo permanente sustenta sozinho.`,
        `${evergreen.diagnostico.elegiveis} itens elegíveis no catálogo; teto de ${evergreen.diagnostico.vagas} vaga(s).`,
      ],
    });
    fs.writeFileSync(path.join(pasta, "index.html"), html, "utf-8");
    escrever(`Preview visual: \`${path.join(pasta, "index.html")}\``);
    escrever();

    for (const p of ciclo.previews) {
      historico.push({
        storyId: p.post.pauta.storyId,
        topicId: p.post.pauta.storyId.split(":").slice(0, 2).join(":"),
        quandoIso: new Date(agoraMs).toISOString(),
      });
    }
  }

  escrever(`## Custo`);
  escrever();
  escrever(`US$ ${custoTotal.toFixed(4)} no lastro. A copy e a arte não estão somadas aqui.`);

  escreverRelatorio(path.join(saida, "relatorio.md"), linhas.join("\n"));
  console.log(`\nRelatório em ${path.join(saida, "relatorio.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
