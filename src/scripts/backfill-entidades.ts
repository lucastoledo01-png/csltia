import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { extrairEntidades } from "../lib/server/editorial/classificador";
import { impressaoDoAcontecimento } from "../lib/server/editorial/fingerprint";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";

/**
 * Reconstrói entidades dos registros históricos.
 *
 * Os 23 registros do backfill não têm entidade porque ninguém extraía na
 * época. Isso deixa a faixa semântica de suspeita sem o sinal que decide, e
 * como confiança baixa não bloqueia mais, repetição real passa.
 *
 * A extração usa SÓ o que já está guardado: título, resumo e fonte. Não busca
 * a página, não deduz o órgão responsável, não completa o país. O que o texto
 * não disser fica vazio, e vazio continua sendo uma resposta correta.
 *
 * O que for reconstruído fica marcado com `_backfilled` dentro do próprio
 * campo de entidades, para nunca se confundir com o que o pipeline extraiu da
 * matéria na hora.
 *
 *   npx tsx src/scripts/backfill-entidades.ts            (só relata)
 *   npx tsx src/scripts/backfill-entidades.ts --aplicar
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
  const aplicar = argv.includes("--aplicar");
  const client = getSupabaseAdminClient();
  const store = criarHistoricoStore(client);

  console.log("=== BACKFILL DE ENTIDADES DO HISTÓRICO ===");
  console.log(`modo: ${aplicar ? "GRAVANDO" : "somente relatório"}`);

  const registros = await store.janela(DEFAULT_PROJECT_ID, 400);
  const semEntidade = registros.filter((r) => {
    const e = r.entidades as { atores?: unknown[] } | undefined;
    return !e || !Array.isArray(e.atores) || e.atores.length === 0;
  });

  console.log(`${registros.length} registros, ${semEntidade.length} sem entidade`);
  if (semEntidade.length === 0) return;

  const { entidades, custoUsd, tokens, falhas } = await extrairEntidades(
    semEntidade.map((r) => ({
      id: r.id ?? r.storyId,
      titulo: r.titulo,
      resumo: r.resumo ?? "",
      fonte: r.dominio ?? "",
    }))
  );

  for (const f of falhas) console.warn(`falha: ${f}`);
  console.log(`extraídas: ${entidades.size} (${tokens} tokens, US$ ${custoUsd.toFixed(4)} estimado)`);

  let vazias = 0;
  let comAlgo = 0;
  const paraGravar: Array<{ id: string; entidades: Record<string, unknown>; impressao: string }> = [];

  for (const r of semEntidade) {
    const chave = r.id ?? r.storyId;
    const e = entidades.get(chave);
    if (!e) continue;

    const temAlgo = e.atores.length > 0 || e.acontecimento.length > 0;
    if (!temAlgo) {
      vazias += 1;
      console.log(`vazio: ${r.titulo.slice(0, 70)}`);
      continue;
    }

    comAlgo += 1;
    console.log(
      `${r.titulo.slice(0, 60)}\n   atores: ${e.atores.join(", ") || "nenhum"}` +
        ` | lugares: ${e.lugares.join(", ") || "nenhum"}` +
        ` | acontecimento: ${e.acontecimento.join(", ") || "nenhum"}`
    );

    paraGravar.push({
      id: chave,
      entidades: { ...e, _backfilled: true },
      impressao: impressaoDoAcontecimento(e),
    });
  }

  console.log(`\ncom entidade reconstruída: ${comAlgo}; sem material suficiente: ${vazias}`);

  if (!aplicar) {
    console.log("Nada foi gravado. Rode de novo com --aplicar.");
    return;
  }

  let gravados = 0;
  for (const item of paraGravar) {
    const { error } = await client
      .from("editorial_history")
      .update({ entities: item.entidades, event_fingerprint: item.impressao })
      .eq("id", item.id);

    if (error) {
      console.error(`falha ao gravar ${item.id}: ${error.message}`);
      continue;
    }
    gravados += 1;
  }

  console.log(`gravados: ${gravados} de ${paraGravar.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
