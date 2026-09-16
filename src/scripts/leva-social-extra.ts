import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectFromSource } from "../lib/server/newsroom/collector";
import type { NewsCandidate } from "../lib/server/newsroom/collector";
import { fontesDeOportunidade } from "../lib/server/newsroom/fontes-oportunidade";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { criarCandidatosStore } from "../lib/server/editorial/candidatos-store";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import { rodarSocialDoDia } from "../lib/server/social/ciclo-do-dia";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";

/**
 * Uma leva EXTRA de posts para o dia que já rodou.
 *
 * Existe para o caso em que o ciclo do dia já passou e alguma coisa mudou
 * depois dele: um desenho novo, uma regra de texto nova, uma marca nova. Sem
 * isto, a única forma de ver a mudança no feed é esperar o cron do dia
 * seguinte, e um ajuste que ninguém vê publicado é um ajuste que ninguém
 * validou.
 *
 * O que ele NÃO é: um segundo ciclo do newsroom. Ele não escreve edição, não
 * cria artigo no portal e não manda e-mail. Roda a linha editorial no canal
 * `instagram` e entrega o pool aprovado ao mesmo `rodarSocialDoDia` que o cron
 * usa, com o mesmo Social Guard e o mesmo congelamento de arte.
 *
 * As duas barreiras de idempotência do store continuam valendo, e são elas que
 * tornam a repetição segura: pauta que já tem post hoje é bloqueada pelo
 * `story_id`, e o mesmo ACONTECIMENTO chegando por outro artigo é bloqueado
 * pelo `event_fingerprint`. Rodar duas vezes não duplica o feed.
 *
 *   npx tsx src/scripts/leva-social-extra.ts --quantos=5
 *   npx tsx src/scripts/leva-social-extra.ts --quantos=5 --valendo
 *
 * Sem `--valendo` ele calcula tudo e não grava nada.
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

function diaDe(iso: string | null | undefined): string {
  if (!iso) return "sem-data";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "sem-data";
}

async function main() {
  carregarEnv();

  const argv = process.argv.slice(2);
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };

  const quantos = Number(valor("quantos") ?? 5);
  /*
   * Quantos dias de publicação entram no pool.
   *
   * Um dia só é o que o cron usa, e é o certo para a rotina. Numa leva extra a
   * pergunta é outra: o dia já rodou, as pautas dele já viraram post, e o que
   * sobra é pouco. Ampliar a janela traz pauta de ontem que ainda não foi
   * publicada, e a camada de repetição continua barrando o que já saiu, em
   * trinta dias de histórico.
   */
  const dias = Math.max(1, Number(valor("dias") ?? 1));
  const valendo = argv.includes("--valendo");
  const hoje = valor("dia") ?? new Date().toISOString().slice(0, 10);

  /*
   * O teto do dia vira o número pedido.
   *
   * `maximoPorDia` é do ambiente, e no ambiente ele vale para o ciclo normal.
   * Aqui a leva é sob demanda, e quem decide o tamanho é quem chama.
   */
  process.env.SOCIAL_POSTS_TARGET_PER_DAY = String(quantos);
  process.env.SOCIAL_POSTS_MAX_PER_DAY = String(quantos);

  /*
   * Os tetos de diversidade sobem JUNTO, e isto precisa ficar visível.
   *
   * `SOCIAL_MAX_IMIGRACAO` e `SOCIAL_MAX_POR_EIXO` valem 3 por padrão, e numa
   * publicação sobre imigração eles são o que decide o tamanho do dia: pedir
   * seis posts e deixar o teto em três devolve três, e a causa não aparece no
   * resultado, só numa linha de descarte no meio do log.
   *
   * O que NÃO sobe é o teto por ACONTECIMENTO, que continua em 1. Ele é o que
   * impede o feed de contar a mesma decisão judicial cinco vezes, que é o
   * defeito que esta semana inteira tentou consertar.
   */
  process.env.SOCIAL_MAX_IMIGRACAO = String(quantos);
  process.env.SOCIAL_MAX_POR_EIXO = String(quantos);
  console.log(
    `[LEVA] tetos desta leva: ${quantos} por dia, ${quantos} de imigração, ${quantos} por eixo. ` +
      `Teto por acontecimento continua 1.`,
  );

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const client = getSupabaseAdminClient();
  const config = carregarConfigEditorial(process.env);

  console.log(`[LEVA] projeto ${project.slug}, dia ${hoje}, alvo ${quantos} post(s), ${valendo ? "VALENDO" : "ensaio"}`);

  const doBanco = await getProjectNewsSources(project.id);
  const novas = fontesDeOportunidade.filter((f) => !doBanco.some((b) => b.url === f.url));
  const fontes = [...doBanco, ...novas].filter((f) => f.enabled);

  const coletado = await Promise.all(
    fontes.map(async (f) => {
      try {
        return await collectFromSource(f, fetch);
      } catch {
        return [] as NewsCandidate[];
      }
    }),
  );

  const todas = coletado.flat();
  const limite = new Date(`${hoje}T00:00:00Z`).getTime() - (dias - 1) * 24 * 60 * 60 * 1000;
  const doDia = todas.filter((c) => {
    const d = diaDe(c.published_at);
    if (d === "sem-data") return false;
    const t = new Date(`${d}T00:00:00Z`).getTime();
    return t >= limite && d <= hoje;
  });
  console.log(
    `[LEVA] ${fontes.length} fontes, ${todas.length} candidatas, ` +
      `${doDia.length} publicadas nos últimos ${dias} dia(s) até ${hoje}`,
  );

  if (doDia.length === 0) {
    console.log("[LEVA] nada publicado hoje nas fontes. Nenhum post a gerar.");
    return;
  }

  const { uniqueGroups } = deduplicateCandidates(doDia);
  const historico = await criarHistoricoStore(client).janela(project.id, config.janelaDeDias);

  const guarda = await avaliarPautas(uniqueGroups, {
    canal: "instagram",
    historico,
    config,
    provedorDeVetor: criarProvedorOpenAI(process.env),
    candidatos: { store: criarCandidatosStore(client), projectId: project.id },
  });

  for (const l of guarda.linhasDeLog) console.log(l);
  console.log(`[LEVA] pool aprovado: ${guarda.approvedEditorialPool.length} pauta(s)`);

  const social = await rodarSocialDoDia(guarda.approvedEditorialPool, {
    projeto: project,
    projectId: project.id,
    projectSlug: project.slug,
    editionDate: hoje,
    marca: {
      nome: project.brand.displayName || project.name,
      nicho: project.niche,
      extra: project.editorialPromptExtra ?? "",
      keyword: String(project.settings?.instagram_keyword ?? "").trim(),
    },
    historico,
    config,
    client,
    persistenciaDegradada: guarda.reuso.erros.length > 0,
    modoForcado: valendo ? "enforce" : "dry_run",
  });

  for (const l of social.ciclo?.linhasDeLog ?? []) console.log(l);

  const d = social.diagnostico;
  console.log(
    `[LEVA] modo ${d.mode}: ${d.candidates} candidatas, ${d.verified} verificadas, ` +
      `${d.selected} post(s), ${d.scheduled} agendado(s), ${d.skipped} descartada(s)`,
  );
  for (const [motivo, n] of Object.entries(d.skippedReasons ?? {})) console.log(`[LEVA] descarte ${motivo}: ${n}`);
  for (const e of d.errors ?? []) console.log(`[LEVA] erro: ${e}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
