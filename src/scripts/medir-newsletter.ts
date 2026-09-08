import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectFromSource } from "../lib/server/newsroom/collector";
import type { NewsCandidate } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import { criarCandidatosStore } from "../lib/server/editorial/candidatos-store";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { conferirFinalistas } from "../lib/server/editorial/finalistas";
import { carregarConfigSocial, comporFeedSocial } from "../lib/server/social/selecao";
import { composicaoAlternativa } from "../lib/server/newsroom/composicao-alternativa";

/**
 * Quantos dias fechariam uma newsletter válida.
 *
 * A pergunta não é "quantas pautas o pool tem", é quantos DIAS chegam ao
 * mínimo de 2 depois de tudo: linha editorial, teto do Brasil, repetição
 * contra a janela de 30 dias. É esse número que decide se a newsletter volta a
 * sair, e é ele que a comparação antes/depois precisa mostrar.
 *
 * Roda com os tetos de PRODUÇÃO, não levantados: levantar o teto mede a
 * configuração, não a capacidade.
 *
 *   npx tsx src/scripts/medir-newsletter.ts --dias=7 --saida=antes.json
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

const FUSO = "America/Sao_Paulo";
const AGREGADORES = new Set(["news.google.com", "news.yahoo.com", "flipboard.com"]);
const diaDe = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "sem-data" : d.toLocaleDateString("en-CA", { timeZone: FUSO });
};

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? null;
  const quantos = Number(valor("dias")) > 0 ? Number(valor("dias")) : 7;
  const saida = valor("saida") ?? "medicao-newsletter.json";
  const rotulo = valor("rotulo") ?? "sem-rotulo";
  const soDias = (valor("apenas") ?? "").split(",").filter(Boolean);
  const repeticoes = Number(valor("repeticoes")) > 0 ? Number(valor("repeticoes")) : 1;
  /*
   * Sem reuso, para o teste de instabilidade.
   *
   * Repetir o mesmo dia com a persistência ligada leria a classificação
   * gravada na primeira volta e devolveria variância zero, o que provaria só
   * que o cache funciona. Medir instabilidade exige classificar de novo.
   */
  const semReuso = argv.includes("--sem-reuso");
  /*
   * Composição alternativa de fontes, em memória.
   *
   * O benchmark tem que rodar ANTES de mexer em produção, então a troca de
   * fontes acontece aqui e não no banco: nada é gravado, nada é desativado, e
   * a produção segue com as 63 de hoje até a configuração ser aprovada.
   */
  const alternativa = argv.includes("--alternativa");
  /** Mede também até onde o social chegaria: verificação e composição do feed. */
  const comSocial = argv.includes("--social");

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const doBanco = (await getProjectNewsSources(project.id)).filter((f) => f.enabled);
  const { fontes, desativadas, acrescentadas } = alternativa
    ? composicaoAlternativa(doBanco)
    : { fontes: doBanco, desativadas: [], acrescentadas: [] };
  const client = getSupabaseAdminClient();
  const config = carregarConfigEditorial(process.env);
  const historico = await criarHistoricoStore(client).janela(project.id, config.janelaDeDias);

  const configSocial = carregarConfigSocial(process.env);

  console.log(
    `[${rotulo}] ${fontes.length} fontes, mínimo ${config.minimoDePautas}, ` +
      `piso ${config.relevanciaMinima}, teto Brasil ${config.maximoDePautasBrasil}, teto ${config.maximoDePautas}.`,
  );
  if (alternativa) {
    console.log(
      `[${rotulo}] composição alternativa: ${desativadas.length} desativadas, ` +
        `${acrescentadas.length} acrescentadas (nada gravado no banco).`,
    );
  }

  const coletado = await Promise.all(
    fontes.map(async (f) => {
      try {
        return await collectFromSource(f, fetch);
      } catch {
        return [] as NewsCandidate[];
      }
    }),
  );

  const porDia = new Map<string, NewsCandidate[]>();
  for (const c of coletado.flat()) {
    const d = diaDe(c.published_at);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d)!.push(c);
  }

  const disponiveis = [...porDia.keys()].filter((d) => d !== "sem-data").sort().reverse().slice(0, quantos);
  const dias = (soDias.length > 0 ? soDias : disponiveis.slice().reverse()).filter((d) => porDia.has(d));

  const linhas: Record<string, unknown>[] = [];

  for (const dia of dias) {
    for (let volta = 1; volta <= repeticoes; volta += 1) {
      const candidatas = porDia.get(dia)!;
      const { uniqueGroups } = deduplicateCandidates(candidatas);

      const tam = (c: NewsCandidate) => (c.description || "").length;
      const vazias = candidatas.filter((c) => tam(c) === 0).length;
      const curtas = candidatas.filter((c) => tam(c) > 0 && tam(c) < 400).length;
      const ate150 = candidatas.filter((c) => tam(c) <= 150).length;
      const acima600 = candidatas.filter((c) => tam(c) > 600).length;
      const deAgregador = candidatas.filter((c) => {
        try {
          return AGREGADORES.has(new URL(c.url).hostname.replace(/^www\./, ""));
        } catch {
          return false;
        }
      }).length;

      const t0 = Date.now();
      const g = await avaliarPautas(uniqueGroups, {
        canal: "newsletter",
        historico,
        config,
        provedorDeVetor: criarProvedorOpenAI(process.env, fetch),
        env: process.env,
        fetcher: fetch,
        ...(semReuso ? {} : { candidatos: { store: criarCandidatosStore(client), projectId: project.id } }),
      });
      const ms = Date.now() - t0;

      const motivos: Record<string, number> = {};
      for (const r of g.recusadas) motivos[r.motivo] = (motivos[r.motivo] ?? 0) + 1;

      const imigracao = g.approvedEditorialPool.filter((pa) => pa.classificacao.imigracao).length;

      /*
       * Até onde o social chegaria.
       *
       * O KPI secundário é "posts sociais confirmáveis por dia", e isso exige o
       * verificador e a composição própria do feed, que existem nesta branch.
       * A copy e a arte ficam na fase 3, que não é tocada aqui.
       */
      let socialConfirmadas: number | null = null;
      let socialEscolhidas: number | null = null;
      if (comSocial && g.approvedEditorialPool.length > 0) {
        const conf = await conferirFinalistas(g.approvedEditorialPool, {
          canal: "instagram",
          vagas: configSocial.maximoPorDia,
          config,
          store: criarCandidatosStore(client),
          projectId: project.id,
          env: process.env,
          fetcher: fetch,
        });
        socialConfirmadas = conf.confirmadas.length;
        socialEscolhidas = comporFeedSocial(conf.confirmadas, configSocial, {}).escolhidas.length;
      } else if (comSocial) {
        socialConfirmadas = 0;
        socialEscolhidas = 0;
      }

      const linha = {
        rotulo,
        dia,
        volta,
        coletadas: candidatas.length,
        grupos: uniqueGroups.length,
        descricaoVazia: vazias,
        descricaoCurta: curtas,
        ate150,
        acima600,
        deAgregador,
        pctAgregador: candidatas.length ? Math.round((deAgregador / candidatas.length) * 100) : 0,
        imigracaoNoPool: imigracao,
        socialConfirmadas,
        socialEscolhidas,
        pool: g.approvedEditorialPool.length,
        selecionadas: g.selecionadas.length,
        viavel: g.viavel,
        fechaNewsletter: g.selecionadas.length >= config.minimoDePautas,
        motivoDaInviabilidade: g.motivoDaInviabilidade ?? null,
        motivos,
        semClassificacao: motivos.REJECT_UNCLASSIFIED ?? 0,
        baixaRelevancia: motivos.REJECT_LOW_RELEVANCE ?? 0,
        euaNegativo: motivos.REJECT_US_NEGATIVE ?? 0,
        fonteNaoResolvida: motivos.REJECT_SOURCE_UNRESOLVED ?? 0,
        tokens: g.tokens.total,
        custoUsd: g.custoUsd,
        ms,
        reuso: g.reuso,
        titulosSelecionados: g.selecionadas.map((p) => p.grupo.primary.title.slice(0, 70)),
      };
      linhas.push(linha);

      console.log(
        `[${rotulo}] ${dia}${repeticoes > 1 ? ` v${volta}` : ""}: ${uniqueGroups.length} grupos, ` +
          `agregador ${linha.pctAgregador}%, ${vazias} sem descrição, pool ${g.approvedEditorialPool.length} ` +
          `(${imigracao} imigração), selecionadas ${g.selecionadas.length}, ` +
          `fecha=${linha.fechaNewsletter ? "SIM" : "não"}` +
          (comSocial ? `, social ${socialConfirmadas}/${socialEscolhidas}` : "") +
          `, ${(ms / 1000).toFixed(0)}s`,
      );
    }
  }

  fs.writeFileSync(
    path.resolve(process.cwd(), saida),
    JSON.stringify({ rotulo, config, alternativa, desativadas, acrescentadas, linhas }, null, 1),
    "utf-8",
  );
  console.log(`[${rotulo}] ${linhas.filter((l) => l.fechaNewsletter).length} de ${linhas.length} rodada(s) fechariam newsletter. Dados em ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
