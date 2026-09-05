import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectAllNews, janelaDaFonte } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { ehAgregador, precisaEnriquecer } from "../lib/server/editorial/enriquecimento";

/** Quanto a coleta traz e quanto disso já vem com corpo. Não usa modelo. */
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
  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const sources = await getProjectNewsSources(project.id);
  const coleta = await collectAllNews(sources);
  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(coleta.candidates);

  console.log(`${sources.length} fontes ativas, ${coleta.candidates.length} candidatas, ${uniqueGroups.length} grupos (${duplicatesCount} duplicatas)`);

  const porFonte = new Map<string, { total: number; comCorpo: number; janela: number; agregador: boolean }>();
  for (const s of sources) porFonte.set(s.name, { total: 0, comCorpo: 0, janela: janelaDaFonte(s), agregador: ehAgregador(s.url) });

  for (const g of uniqueGroups) {
    const f = porFonte.get(g.primary.source_name);
    if (!f) continue;
    f.total += 1;
    if (!precisaEnriquecer(g.primary.title, g.primary.description || "")) f.comCorpo += 1;
  }

  console.log("\nfonte | coletadas | já com corpo | janela | agregador");
  for (const [nome, f] of [...porFonte.entries()].sort((a, b) => b[1].total - a[1].total)) {
    if (f.total === 0) continue;
    console.log(`${nome.slice(0, 44).padEnd(46)} ${String(f.total).padStart(3)} ${String(f.comCorpo).padStart(4)} ${String(f.janela).padStart(4)}h ${f.agregador ? "sim" : "não"}`);
  }

  const semNada = [...porFonte.entries()].filter(([, f]) => f.total === 0).map(([n]) => n);
  console.log(`\nsem itens na janela: ${semNada.join(", ") || "nenhuma"}`);

  const comCorpo = uniqueGroups.filter((g) => !precisaEnriquecer(g.primary.title, g.primary.description || "")).length;
  const naoAgregador = uniqueGroups.filter((g) => !ehAgregador(g.primary.url)).length;
  console.log(`\ntotal já com corpo no feed: ${comCorpo} de ${uniqueGroups.length}`);
  console.log(`com URL buscável (não agregador): ${naoAgregador} de ${uniqueGroups.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
