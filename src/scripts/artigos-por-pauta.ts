import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { planejarEdicao, type ArtigoDaPauta, type EdicaoComoArtigo, type PlanoDaEdicao } from "../lib/server/artigos-por-pauta";

/**
 * As edições antigas do portal viram uma matéria por pauta (05/10/2026).
 *
 * Ensaio por padrão: lê o banco, monta o plano e imprime EXATAMENTE o que
 * gravaria. Só grava com `--aplicar`, e quem roda é o dono.
 *
 *   npx tsx src/scripts/artigos-por-pauta.ts                 (ensaio)
 *   npx tsx src/scripts/artigos-por-pauta.ts --detalhe       (ensaio com o HTML de cada matéria)
 *   npx tsx src/scripts/artigos-por-pauta.ts --aplicar       (grava)
 *
 * O que `--aplicar` faz, nesta ordem:
 *
 *   1. upsert de cada matéria em `articles`, por `(project_id, slug)`. Rodar
 *      duas vezes grava a mesma coisa duas vezes, e não duplica nada;
 *   2. só se TODAS as matérias de uma edição foram gravadas, a linha
 *      `edicao-AAAA-MM-DD` sai da lista do portal: `status = archived`.
 *      Nada é apagado ("não apague o que dá para desligar"). O link antigo
 *      passa a redirecionar para a primeira matéria da edição, pela página
 *      `/artigos/[slug]`.
 *
 * `archived` está no CHECK da migration original de `articles`, mas o banco
 * não é o que as migrations dizem. Para conferir antes, no SQL Editor (só lê):
 *
 *   select pg_get_constraintdef(oid) from pg_constraint
 *   where conrelid = 'public.articles'::regclass and contype = 'c';
 *
 * Se o banco recusar `archived` (erro 23514), o script cai em `draft`, que o
 * portal também não lista, e diz isso na saída. As duas são reversíveis com
 * um `update ... set status = 'published'`.
 *
 * Nenhuma chamada de modelo: o texto é o que a edição já publicou.
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

const STATUS_FORA_DA_LISTA = ["archived", "draft"] as const;

function linhaDoArtigo(a: ArtigoDaPauta, agoraIso: string): Record<string, unknown> {
  return { ...a, updated_at: agoraIso };
}

function imprimirPlano(p: PlanoDaEdicao, existentes: Map<string, { status: string; origem: boolean }>, detalhe: boolean): void {
  console.log(`\n== ${p.edicao}: ${p.artigos.length} matéria(s), ${p.puladas.length} pulada(s)`);
  for (const a of p.artigos) {
    const ja = existentes.get(a.slug);
    const estado = !ja ? "nova" : ja.origem ? `já existe (${ja.status}), será regravada` : `CONFLITO: slug já usado por outra matéria (${ja.status})`;
    console.log(`  + ${a.slug}`);
    console.log(`      título     ${a.title}`);
    console.log(`      editoria   ${a.category}`);
    console.log(`      publicada  ${a.published_at}`);
    console.log(`      capa       ${a.cover_image ?? "(sem foto: peça tipográfica)"}`);
    console.log(`      fonte      ${a.source_urls.join(" | ") || "(nenhuma)"}`);
    console.log(`      seções     ${a.content.map((s) => s.heading || "abertura").join(", ")}`);
    console.log(`      estado     ${estado}`);
    if (detalhe) console.log(`      html       ${a.content_html}`);
  }
  for (const s of p.puladas) console.log(`  - pulada #${s.posicao + 1}: ${s.titulo} [${s.categoria}] (${s.motivo})`);
  console.log(`  ~ ${p.edicao}: sai da lista do portal (status archived), redireciona para ${p.artigos[0]?.slug ?? "/artigos"}`);
}

async function main(): Promise<void> {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const detalhe = process.argv.includes("--detalhe");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.");
  const client = createClient(url, chave, { auth: { persistSession: false } });

  const { data: edicoes, error } = await client
    .from("articles")
    .select("slug, project_id, status, published_at, cover_image, content, content_html")
    .like("slug", "edicao-%")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`não consegui ler as edições: ${error.message}`);

  const planos = ((edicoes ?? []) as Array<EdicaoComoArtigo & { status: string }>)
    .map((e) => ({ status: e.status, plano: planejarEdicao(e) }))
    .filter((x): x is { status: string; plano: PlanoDaEdicao } => x.plano !== null);

  const slugs = planos.flatMap((x) => x.plano.artigos.map((a) => a.slug));
  const existentes = new Map<string, { status: string; origem: boolean }>();
  for (let i = 0; i < slugs.length; i += 100) {
    const { data, error: e2 } = await client.from("articles").select("slug, status, tags").in("slug", slugs.slice(i, i + 100));
    if (e2) throw new Error(`não consegui conferir slugs existentes: ${e2.message}`);
    for (const r of (data ?? []) as Array<{ slug: string; status: string; tags: string[] | null }>) {
      existentes.set(r.slug, { status: r.status, origem: (r.tags ?? []).some((t) => t.startsWith("origem:edicao-")) });
    }
  }

  console.log(aplicar ? "MODO: APLICAR (grava no banco)" : "MODO: ENSAIO (nada é gravado; use --aplicar para gravar)");
  for (const { plano } of planos) imprimirPlano(plano, existentes, detalhe);

  const totalArtigos = planos.reduce((n, x) => n + x.plano.artigos.length, 0);
  const totalPuladas = planos.reduce((n, x) => n + x.plano.puladas.length, 0);
  const semFoto = planos.reduce((n, x) => n + x.plano.semFoto.length, 0);
  const conflitos = slugs.filter((s) => existentes.has(s) && !existentes.get(s)!.origem);
  const aDeslistar = planos.filter((x) => x.status === "published").length;

  console.log("\n== Resumo");
  console.log(`edições lidas                ${planos.length}`);
  console.log(`matérias a gravar            ${totalArtigos} (${semFoto} sem foto, com peça tipográfica)`);
  console.log(`pautas puladas (imigração)   ${totalPuladas}`);
  console.log(`edições a tirar da lista     ${aDeslistar} (de ${planos.length}; as demais já estão fora)`);
  console.log(`conflitos de slug            ${conflitos.length}${conflitos.length ? `: ${conflitos.join(", ")}` : ""}`);

  if (!aplicar) return;
  if (conflitos.length) throw new Error("Há slug já usado por matéria que não veio de edição. Nada foi gravado.");

  const agoraIso = new Date().toISOString();
  let statusFora: (typeof STATUS_FORA_DA_LISTA)[number] = STATUS_FORA_DA_LISTA[0];
  let gravadas = 0;
  let deslistadas = 0;

  for (const { plano } of planos) {
    let falhou = false;
    for (const a of plano.artigos) {
      const { error: e3 } = await client.from("articles").upsert(linhaDoArtigo(a, agoraIso), { onConflict: "project_id,slug" });
      if (e3) {
        falhou = true;
        console.error(`  ERRO ${a.slug}: ${e3.message}`);
      } else gravadas++;
    }
    if (falhou) {
      console.error(`  ${plano.edicao} continua publicada: nem todas as matérias dela foram gravadas.`);
      continue;
    }

    let r = await client
      .from("articles")
      .update({ status: statusFora, updated_at: agoraIso })
      .eq("slug", plano.edicao)
      .eq("status", "published")
      .select("slug");
    if (r.error?.code === "23514" && statusFora === "archived") {
      console.warn("  o banco recusou status archived (CHECK); as edições vão para draft, que o portal também não lista");
      statusFora = "draft";
      r = await client
        .from("articles")
        .update({ status: statusFora, updated_at: agoraIso })
        .eq("slug", plano.edicao)
        .eq("status", "published")
        .select("slug");
    }
    if (r.error) console.error(`  ERRO ao tirar ${plano.edicao} da lista: ${r.error.message}`);
    else deslistadas += (r.data ?? []).length;
  }

  console.log(`\nGravadas ${gravadas} matéria(s); ${deslistadas} edição(ões) fora da lista, com status ${statusFora}.`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
