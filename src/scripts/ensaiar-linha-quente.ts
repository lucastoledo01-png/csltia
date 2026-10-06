/**
 * Ensaio da linha quente (06/10/2026) sobre as candidatas de verdade, SEM
 * escrever no banco.
 *
 *   npx tsx src/scripts/ensaiar-linha-quente.ts                 # 48h, eleição, teto US$ 2
 *   npx tsx src/scripts/ensaiar-linha-quente.ts --horas=24 --teto=1 --modo=so_mercado
 *
 * Lê `news_candidates` da janela (só SELECT), reclassifica cada uma com o
 * prompt NOVO no modo pedido (`classificarPautas`, a mesma chamada da guarda,
 * sem store), decide com `decidirPauta` e compara com a decisão gravada em
 * produção. Depois passa as aprovações novas de política brasileira e de
 * citação pelo verificador do Instagram, para ver se a segunda leitura as
 * confirma. Nada é gravado: nem classificação, nem verificação, nem evento.
 *
 * O Google News fica de fora por padrão (`--com-google-news` inclui): as
 * buscas fixas são desligadas pela mesma entrega, e nenhuma candidata dele foi
 * aprovada na semana medida.
 *
 * O teto é sobre a estimativa de custo do código (`calculateCost`, que cobra
 * preço de gpt-4o para modelo que não conhece): o ensaio para de classificar
 * quando a próxima rodada passaria dele.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { classificarPautas, decidirPauta, ehCitacaoDeFamoso, ehPoliticaBrasileira, type Classificacao } from "../lib/server/editorial/classificador";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { verificarFinalistas } from "../lib/server/editorial/verificador";
import type { PoliticaBrasileira } from "../lib/server/editorial/linha-editorial";

function carregarEnv() {
  const arquivo = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#") || !l.includes("=")) continue;
    const i = l.indexOf("=");
    const k = l.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");

type Linha = {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  source_domain: string | null;
  status: string;
  decision_reason: string | null;
  created_at: string;
};

/** Os temas que o dono quer contados, por palavra no título (só para o relatório). */
const ESPORTE = /\b(nfl|nba|mlb|nhl|super bowl|copa|world cup|futebol|soccer|olymp|ol[íi]mp|time de|team|jogo|game|match|placar|score|campeonato|championship|playoff|tênis|tennis|f1|fórmula)\b/i;
const IMIGRACAO = /\b(ice|deport|immigra|imigra|visa|visto|green card|asylum|asilo|border|fronteira|uscis|migrant)\b/i;

async function main() {
  carregarEnv();
  const horas = Number(arg("horas") ?? 48) || 48;
  const teto = Number(arg("teto") ?? 2) || 2;
  const modo = (arg("modo") ?? "eleicao") as PoliticaBrasileira;
  const comGoogleNews = process.argv.includes("--com-google-news");
  const projectId = process.env.PROJETO_ID ?? "00000000-0000-4000-8000-000000000001";
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await client
      .from("news_candidates")
      .select("id,url,title,summary,source_domain,status,decision_reason,created_at")
      .eq("project_id", projectId)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as Linha[]));
    if ((data ?? []).length < 1000) break;
  }

  // Uma por URL: a mesma matéria lida em duas coletas conta uma vez, com a decisão mais recente.
  const porUrl = new Map<string, Linha>();
  for (const l of linhas) porUrl.set(l.url, l);
  const todas = [...porUrl.values()];
  const doGoogle = (l: Linha) => (l.source_domain ?? "").includes("news.google.com") || l.url.includes("news.google.com");
  const alvo = todas.filter((l) => comGoogleNews || !doGoogle(l));
  console.log(
    `[ENSAIO] ${linhas.length} linhas, ${todas.length} URLs distintas em ${horas}h; ${alvo.length} no ensaio` +
      (comGoogleNews ? "" : ` (${todas.length - alvo.length} do Google News fora)`) +
      `; modo ${modo}; teto US$ ${teto.toFixed(2)}`,
  );

  const config = carregarConfigEditorial(process.env, { settings: { linha: { politica_brasileira: modo } } });
  const env = process.env as Record<string, string | undefined>;

  // Em rodadas de 80: cada rodada custa medido, e a seguinte só sai se couber no teto.
  const classificacoes = new Map<string, Classificacao>();
  let custo = 0;
  let tokens = 0;
  let classificadas = 0;
  const RODADA = 80;
  for (let i = 0; i < alvo.length; i += RODADA) {
    const lote = alvo.slice(i, i + RODADA);
    const media = classificadas > 0 ? custo / classificadas : 0.004;
    if (custo + media * lote.length > teto * 0.9) {
      console.log(`[ENSAIO] teto: parando em ${classificadas} de ${alvo.length} (US$ ${custo.toFixed(3)} gastos)`);
      break;
    }
    const r = await classificarPautas(
      lote.map((l) => ({ id: l.id, titulo: l.title, descricao: l.summary ?? "", fonte: l.source_domain ?? "", url: l.url })),
      env,
      fetch,
      config.linha,
    );
    for (const [id, c] of r.classificacoes) classificacoes.set(id, c);
    custo += r.custoUsd;
    tokens += r.tokens.total;
    classificadas += lote.length;
    console.log(`[ENSAIO] ${classificadas}/${alvo.length} classificadas, US$ ${custo.toFixed(3)}, ${tokens} tokens`);
    for (const f of r.lotesComFalha) console.log(`[ENSAIO] falha: ${f}`);
  }

  type Resultado = { l: Linha; c: Classificacao; motivo: string; aprovada: boolean; antes: boolean };
  const resultados: Resultado[] = [];
  for (const l of alvo) {
    const c = classificacoes.get(l.id);
    if (!c) continue;
    const d = decidirPauta(c, config);
    resultados.push({ l, c, motivo: d.motivo, aprovada: d.aprovada, antes: l.status === "approved" });
  }

  const novas = resultados.filter((r) => r.aprovada && !r.antes);
  const perdidas = resultados.filter((r) => !r.aprovada && r.antes);
  const contar = (lista: Resultado[], f: (r: Resultado) => string) =>
    Object.entries(lista.reduce<Record<string, number>>((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");

  console.log(`\n## Resultado (${resultados.length} classificadas)\n`);
  console.log(`aprovadas antes (gravado): ${resultados.filter((r) => r.antes).length}`);
  console.log(`aprovadas agora: ${resultados.filter((r) => r.aprovada).length}`);
  console.log(`novas aprovadas: ${novas.length} :: ${contar(novas, (r) => r.motivo)}`);
  console.log(`antes aprovadas, agora fora: ${perdidas.length} :: ${contar(perdidas, (r) => r.motivo)}`);
  console.log(`recusas agora: ${contar(resultados.filter((r) => !r.aprovada), (r) => r.motivo)}`);

  const politica = resultados.filter((r) => r.aprovada && r.motivo === "APPROVED_BRAZIL_POLITICS");
  const citacoes = resultados.filter((r) => r.aprovada && r.motivo === "APPROVED_FAMOUS_QUOTE");
  const esporte = resultados.filter((r) => r.aprovada && ESPORTE.test(r.l.title));
  const esporteFora = resultados.filter((r) => !r.aprovada && ESPORTE.test(r.l.title));
  console.log(`\npolítica brasileira aprovada: ${politica.length} (${politica.filter((r) => !r.antes).length} nova(s))`);
  console.log(`citação de famoso aprovada: ${citacoes.length} (${citacoes.filter((r) => !r.antes).length} nova(s))`);
  console.log(`marcadas como política brasileira (qualquer decisão): ${resultados.filter((r) => ehPoliticaBrasileira(r.c)).length}`);
  console.log(`marcadas como citação de famoso válida (qualquer decisão): ${resultados.filter((r) => ehCitacaoDeFamoso(r.c)).length}`);
  console.log(`esporte no título, aprovado: ${esporte.length}; recusado: ${esporteFora.length}`);

  // O que tem de continuar fora.
  const imigracaoAprovada = resultados.filter((r) => r.aprovada && (r.c.imigracao || r.c.eixo === "imigracao" || IMIGRACAO.test(r.l.title)));
  const eua = resultados.filter((r) => r.c.pais === "EUA" && r.c.leitura === "desfavoravel");
  console.log(`\nimigração: ${resultados.filter((r) => r.motivo === "REJECT_IMMIGRATION_OFF_LINE").length} recusadas, ${imigracaoAprovada.length} aprovadas com sinal de imigração no título`);
  for (const r of imigracaoAprovada) console.log(`  ! ${r.motivo} :: ${r.l.title.slice(0, 110)}`);
  console.log(`notícia ruim dos EUA: ${eua.length} lidas como desfavoráveis, aprovadas ${eua.filter((r) => r.aprovada).length}`);

  const listar = (titulo: string, lista: Resultado[]) => {
    console.log(`\n### ${titulo} (${lista.length})`);
    for (const r of lista) {
      const extra = r.c.citacao_de_famoso ? ` [fala: ${r.c.quem_fala}]` : "";
      console.log(`- ${r.motivo} | ${r.c.pais}/${r.c.eixo}/${r.c.natureza}/rel ${r.c.relevancia}${extra} | antes: ${r.l.decision_reason?.split(":")[0] ?? r.l.status} :: ${r.l.title.slice(0, 120)}`);
    }
  };
  listar("Novas aprovadas", novas);
  listar("Antes aprovadas, agora fora", perdidas);
  listar("Esporte aprovado", esporte);

  // A segunda leitura do Instagram, só nas novas de política e citação, com o resto do teto.
  const paraVerificar = [...politica, ...citacoes].filter((r) => !r.antes).slice(0, 16);
  if (paraVerificar.length && custo < teto * 0.95) {
    const v = await verificarFinalistas(
      paraVerificar.map((r) => ({
        storyId: r.l.id,
        titulo: r.l.title,
        fonte: r.l.source_domain ?? "",
        url: r.l.url,
        contexto: r.l.summary ?? r.l.title,
        classificacaoPrimaria: r.c,
      })),
      { config, env },
    );
    custo += v.custoUsd;
    console.log(`\n### Verificador do Instagram nas novas de política e citação (${paraVerificar.length}, US$ ${v.custoUsd.toFixed(3)})`);
    const veredictos: Record<string, number> = {};
    for (const r of paraVerificar) {
      const x = v.verificacoes.get(r.l.id);
      veredictos[x?.veredicto ?? "sem"] = (veredictos[x?.veredicto ?? "sem"] ?? 0) + 1;
      console.log(`- ${x?.veredicto ?? "sem"} :: ${x?.motivo.slice(0, 90) ?? ""} :: ${r.l.title.slice(0, 90)}`);
    }
    console.log(`veredictos: ${JSON.stringify(veredictos)}`);
  }

  console.log(`\n[ENSAIO] custo estimado total US$ ${custo.toFixed(3)} (${tokens} tokens de classificação). Nada foi gravado.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
