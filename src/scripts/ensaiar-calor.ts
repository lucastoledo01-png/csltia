/**
 * Ensaio do calor sobre as pautas APROVADAS de verdade, contra as fontes
 * reais e SEM escrever no banco.
 *
 *   npx tsx src/scripts/ensaiar-calor.ts            # últimas 24h
 *   npx tsx src/scripts/ensaiar-calor.ts 48         # últimas 48h
 *
 * Lê `news_candidates` aprovadas, monta a pauta com o que a linha gravou
 * (título, atores, nota) e calcula o calor com Google Trends, Wikipédia,
 * Wikidata e o vetor dos títulos do dia. Imprime a ordem pela nota de hoje e
 * a ordem com o calor. Custa só os vetores dos títulos (centavos de centavo).
 *
 * Criado em 06/10/2026 junto com a capacidade `calor`, para o dono ver o que
 * ela faria antes de pôr o projeto em `dry_run`.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../lib/server/editorial/guarda";
import { calcularCalorDoDia, fontesPadraoDoCalor } from "../lib/server/editorial/calor-do-dia";
import { bonusDoCalor } from "../lib/server/editorial/calor";

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

async function main() {
  carregarEnv();
  const horas = Number(process.argv[2] ?? 24) || 24;
  const projectId = process.env.PROJETO_ID ?? "00000000-0000-4000-8000-000000000001";
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
  const { data, error } = await client
    .from("news_candidates")
    .select("id,url,title,description,published_at,story_id,actors,editorial_score,country,editorial_axis,relevance")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .gte("published_at", desde)
    .limit(200);
  if (error) throw new Error(error.message);

  // Uma pauta por story_id: a mesma história aprovada em dois dias conta uma vez.
  const vistos = new Set<string>();
  const pool: PautaAvaliada[] = [];
  for (const c of data ?? []) {
    const id = c.story_id ?? c.id;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pool.push({
      grupo: { primary: { url: c.url, title: c.title, description: c.description ?? "", published_at: c.published_at }, secondary_sources: [], secondary_urls: [] } as never,
      storyId: id,
      classificacao: { atores: (c.actors as string[]) ?? [], pais: c.country, eixo: c.editorial_axis, relevancia: c.relevance } as never,
      enriquecimento: { texto: "" } as never,
      motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
      veredito: {} as never,
      pontuacao: { total: Number(c.editorial_score ?? 0), partes: {} as never, explicacao: "" },
      vetor: null,
    });
  }

  const calor = await calcularCalorDoDia(pool, { fontes: fontesPadraoDoCalor({ client, projectId }) });
  for (const l of calor.linhas) console.log(l);

  const linhas = pool.map((p) => {
    const c = calor.porStory.get(p.storyId)!;
    return { p, c, comCalor: p.pontuacao.total + bonusDoCalor(c) };
  });
  const porNota = [...linhas].sort((a, b) => b.p.pontuacao.total - a.p.pontuacao.total);
  const porCalor = [...linhas].sort((a, b) => b.comCalor - a.comCalor);

  console.log(`\n${pool.length} pauta(s) aprovada(s) nas últimas ${horas}h\n`);
  console.log("ORDEM COM CALOR (nota + bônus) | posição pela nota | calor | sinais");
  porCalor.forEach((l, i) => {
    const antes = porNota.indexOf(l) + 1;
    console.log(
      `${String(i + 1).padStart(2)}. ${String(l.comCalor).padStart(3)} (era ${String(antes).padStart(2)}º, nota ${l.p.pontuacao.total}) ` +
        `calor ${l.c.total} :: ${l.p.grupo.primary.title.slice(0, 90)}\n      ${l.c.explicacao}`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
