/**
 * Ensaio do piso de alcance nacional sobre as pautas APROVADAS de verdade,
 * SEM escrever no banco e sem chamada de modelo.
 *
 *   npx tsx src/scripts/ensaiar-alcance.ts        # últimas 48h
 *   npx tsx src/scripts/ensaiar-alcance.ts 24     # últimas 24h
 *
 * Lê `news_candidates` aprovadas pela abertura eleitoral
 * (APPROVED_BRAZIL_POLITICS) ou pela citação de famoso (APPROVED_FAMOUS_QUOTE),
 * pergunta à Wikipédia pelo protagonista (`alcance.ts`) e lista o que cairia.
 * Criado em 06/10/2026, junto com o piso. Só a regra determinística: a regra de
 * texto nova do classificador só vale na reclassificação.
 */

import fs from "node:fs";
import path from "node:path";
import { buscaDeEntidadePadrao, conferirAlcance } from "../lib/server/editorial/alcance";
import { criarCandidatosStore } from "../lib/server/editorial/candidatos-store";
import { MOTIVOS } from "../lib/server/editorial/config";
import { getSupabaseAdminClient, travarEscritasDoBanco } from "../lib/server/supabase-admin";

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
  travarEscritasDoBanco();
  const horas = Number(process.argv[2] ?? 48) || 48;
  const projectId = process.env.PROJETO_ID ?? "00000000-0000-4000-8000-000000000001";
  const desde = Date.now() - horas * 3600 * 1000;

  const janela = await criarCandidatosStore(getSupabaseAdminClient()).buscarDaJanela(projectId, Math.ceil(horas / 24) + 1);
  const alvos = [...janela.values()].filter(
    (c) =>
      c.status === "approved" &&
      (c.decisionReason === MOTIVOS.APROVADO_POLITICA_BRASIL || c.decisionReason === MOTIVOS.APROVADO_CITACAO_DE_FAMOSO) &&
      c.classificacao &&
      Date.parse(c.classifiedAt ?? "") >= desde,
  );

  const buscar = buscaDeEntidadePadrao();
  const caem: string[] = [];
  const ficam: string[] = [];
  for (const c of alvos) {
    try {
      const v = await conferirAlcance({ classificacao: c.classificacao!, motivo: c.decisionReason ?? "" }, buscar);
      const atores = (c.classificacao!.atores ?? []).slice(0, 3).join(", ");
      const linha = `${c.decisionReason === MOTIVOS.APROVADO_CITACAO_DE_FAMOSO ? "citação" : "política"} | ${c.title.slice(0, 90)} {${atores}}`;
      if (v.confere && !v.passa) caem.push(`${linha}\n    -> ${v.explicacao}`);
      else ficam.push(`${linha}  [${v.confere && v.passa ? (v.protagonista ?? "sem ator") : "-"}]`);
    } catch (e) {
      ficam.push(`ERRO DE REDE (passaria) | ${c.title.slice(0, 90)} :: ${(e as Error).message}`);
    }
  }

  console.log(`${alvos.length} pautas aprovadas por política ou citação nas últimas ${horas}h`);
  console.log(`\nCAEM (${caem.length}):`);
  for (const l of caem) console.log(`  ${l}`);
  console.log(`\nFICAM (${ficam.length}):`);
  for (const l of ficam) console.log(`  ${l}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
