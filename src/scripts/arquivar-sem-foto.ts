import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import { publicadasSemFoto, type ArtigoParaConferir } from "../lib/server/arquivar-sem-foto";

/**
 * As matérias PUBLICADAS sem foto real, para o dono decidir (05/10/2026).
 *
 * A regra "pauta sem foto não vira conteúdo" vale daqui para frente. O que já
 * está no ar com capa vazia (peça tipográfica) ou com a bandeira de último
 * recurso é listado aqui, e só sai da lista do portal com `--aplicar`.
 *
 *   npx tsx src/scripts/arquivar-sem-foto.ts                    (ensaio: só lista)
 *   npx tsx src/scripts/arquivar-sem-foto.ts --aplicar          (arquiva todas da lista)
 *   npx tsx src/scripts/arquivar-sem-foto.ts --aplicar --so a,b (arquiva só esses slugs)
 *
 * O que `--aplicar` faz é o padrão de `artigos-por-pauta.ts`: `status =
 * archived`, e se o CHECK do banco recusar (23514), `draft`, que o portal
 * também não lista. Nada é apagado ("não apague o que dá para desligar"), e a
 * volta é um `update ... set status = 'published'`.
 */

const STATUS_FORA_DA_LISTA = ["archived", "draft"] as const;

async function main(): Promise<void> {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const iSo = process.argv.indexOf("--so");
  const so = iSo > 0 ? new Set((process.argv[iSo + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) : null;
  const client = clienteDoBanco();

  const { data, error } = await client
    .from("articles")
    .select("slug, title, cover_image, status, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`não consegui ler as matérias: ${error.message}`);

  const lista = publicadasSemFoto((data ?? []) as ArtigoParaConferir[]);
  const alvo = so ? lista.filter((a) => so.has(a.slug)) : lista;

  console.log(aplicar ? "MODO: APLICAR (grava no banco)" : "MODO: ENSAIO (nada é gravado; use --aplicar para arquivar)");
  console.log(`\n${lista.length} matéria(s) publicada(s) sem foto real, de ${(data ?? []).length} publicada(s):\n`);
  for (const a of lista) {
    const marca = so && !so.has(a.slug) ? " " : "-";
    console.log(`  ${marca} ${a.slug}  [${a.motivo === "bandeira" ? "bandeira" : "capa vazia"}]  ${String(a.published_at ?? "").slice(0, 10)}  ${a.title ?? ""}`);
  }
  if (so) {
    const faltam = [...so].filter((s) => !lista.some((a) => a.slug === s));
    if (faltam.length) console.log(`\n  ignorados (não estão na lista): ${faltam.join(", ")}`);
  }

  if (!aplicar || alvo.length === 0) return;

  let statusFora: (typeof STATUS_FORA_DA_LISTA)[number] = STATUS_FORA_DA_LISTA[0];
  const agoraIso = new Date().toISOString();
  let arquivadas = 0;
  for (const a of alvo) {
    let r = await client
      .from("articles")
      .update({ status: statusFora, updated_at: agoraIso })
      .eq("slug", a.slug)
      .eq("status", "published")
      .select("slug");
    if (r.error?.code === "23514" && statusFora === "archived") {
      console.warn("  o banco recusou status archived (CHECK); as matérias vão para draft, que o portal também não lista");
      statusFora = "draft";
      r = await client
        .from("articles")
        .update({ status: statusFora, updated_at: agoraIso })
        .eq("slug", a.slug)
        .eq("status", "published")
        .select("slug");
    }
    if (r.error) console.error(`  ERRO ${a.slug}: ${r.error.message}`);
    else arquivadas += (r.data ?? []).length;
  }
  console.log(`\n${arquivadas} matéria(s) fora da lista do portal, com status ${statusFora}.`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
