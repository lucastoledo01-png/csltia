/**
 * Agenda um carrossel feito à mão pela fila de aprovação (09/11/2026), em
 * `aguardando`: o dono aprova no painel e o worker publica no horário.
 *
 *   npx tsx src/scripts/_agendar-carrossel-manual.ts --pasta producao-manual/2026-11-09/carrossel-nvidia \
 *     --quando 2026-11-09T21:07:00Z --slug caso-jensen-huang \
 *     --foto-capa <url da foto da capa> --credito-capa "Mothership" [--valendo]
 *
 * A pasta traz `slide-1..N.png` (e o `.jpg` de cada um, usado quando o PNG
 * passa do limite interno) e `legenda.txt`, já com hashtags e o fecho.
 *
 * `--foto-capa` é obrigatório: o worker recusa o carrossel sem
 * `content_json.visual` (SOCIAL_V2_PAYLOAD_INCOMPLETE). Foi o que segurou o
 * carrossel do caso Jensen Huang por meia hora em 09/11/2026: aprovado,
 * liberado e recusado pelo publicador.
 *
 * O Social Guard NÃO roda aqui. Isso fica na linha e como aviso na fila.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { carregarEnv } from "./artigos-comum";

carregarEnv();

const PROJETO_ID = "00000000-0000-4000-8000-000000000001";

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const pasta = argumento("--pasta");
  const quando = argumento("--quando");
  const slug = argumento("--slug");
  const fotoCapa = argumento("--foto-capa");
  const creditoCapa = argumento("--credito-capa") ?? "";
  const valendo = process.argv.includes("--valendo");
  if (!pasta || !quando || !slug || !fotoCapa) {
    throw new Error("use --pasta <pasta> --quando <utc> --slug <slug> --foto-capa <url> [--credito-capa <nome>] [--valendo]");
  }

  const { getSupabaseAdminClient } = await import("@/lib/server/supabase-admin");
  const { sha256De, LIMITE_INTERNO_DE_BYTES } = await import("@/lib/server/social/artefato");
  const { varianteDaCapa } = await import("@/lib/server/social/arte");
  const { hashDoPostDaLinha } = await import("@/lib/server/aprovacao/hash");
  const { depsDaFila, projetoDaFila } = await import("@/lib/server/aprovacao/integracao");
  const { enfileirar } = await import("@/lib/server/aprovacao/fila");

  const caption = readFileSync(path.join(pasta, "legenda.txt"), "utf8").trim();
  const headline = caption.split("\n")[0].trim();
  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).slice(0, 5);
  const edicao = quando.slice(0, 10);
  const storyId = `manual-carrossel-${edicao}-${slug}`;
  const chave = `social-v2-${edicao}-${storyId}`;

  const prontos: Array<{ index: number; buffer: Buffer; mime: string; ext: string }> = [];
  for (let n = 1; existsSync(path.join(pasta, `slide-${n}.png`)); n++) {
    const png = path.join(pasta, `slide-${n}.png`);
    const jpg = path.join(pasta, `slide-${n}.jpg`);
    const usarJpg = readFileSync(png).byteLength > LIMITE_INTERNO_DE_BYTES && existsSync(jpg);
    const buffer = readFileSync(usarJpg ? jpg : png);
    if (buffer.byteLength > LIMITE_INTERNO_DE_BYTES) throw new Error(`slide ${n} passa do limite interno`);
    prontos.push({ index: n, buffer, mime: usarJpg ? "image/jpeg" : "image/png", ext: usarJpg ? "jpg" : "png" });
  }
  if (prontos.length < 2) throw new Error("carrossel precisa de pelo menos 2 slides");
  console.log(headline);
  console.log(`${prontos.length} slides, publicar em ${quando}, hashtags: ${hashtags.join(" ") || "nenhuma"}`);
  if (!valendo) {
    console.log("(ensaio: nada gravado)");
    return;
  }

  const client = getSupabaseAdminClient();
  const { data: projetoRow } = await client.from("projects").select("id, timezone, settings").eq("id", PROJETO_ID).single();
  const projeto = projetoDaFila(projetoRow as never, PROJETO_ID);
  if (!projeto) throw new Error("projeto da fila indisponível");
  const { data: existente } = await client.from("social_posts").select("id").eq("project_id", PROJETO_ID).eq("idempotency_key", chave).maybeSingle();
  if (existente) throw new Error(`já existe: ${(existente as { id: string }).id}`);

  const artefatos: Array<Record<string, unknown>> = [];
  for (const a of prontos) {
    const nn = String(a.index).padStart(2, "0");
    const caminho = `desbuguei/${edicao}/social-v2-manual-${slug}/social-v2-${nn}.${a.ext}`;
    const { error } = await client.storage.from("public_assets").upload(caminho, a.buffer, { contentType: a.mime, upsert: true });
    if (error) throw new Error(`upload ${caminho}: ${error.message}`);
    const url = client.storage.from("public_assets").getPublicUrl(caminho).data.publicUrl;
    const sha = sha256De(a.buffer);
    const r = await fetch(url);
    if (!r.ok || sha256De(Buffer.from(await r.arrayBuffer())) !== sha) throw new Error(`hash divergente em ${url}`);
    artefatos.push({ index: a.index, url, path: caminho, filename: `social-v2-${nn}.${a.ext}`, mime: a.mime, sha256: sha, bytes: a.buffer.byteLength, largura: 2160, altura: 2880, otimizado: a.mime === "image/jpeg" });
  }

  const linha = {
    project_id: PROJETO_ID, edition_date: edicao, platform: "instagram", post_type: "carousel", status: "draft", dry_run: false,
    idempotency_key: chave, title: headline.slice(0, 300), caption,
    slides_manifest: artefatos.map((a) => ({ index: a.index, url: a.url, filename: a.filename, sha256: a.sha256, bytes: a.bytes, provider_child_id: null })),
    asset_paths: artefatos.map((a) => a.url), scheduled_at: quando, scheduled_slot: `manual-carrossel-${edicao}-${slug}`,
    generation_version: "social-v2", story_id: storyId, origin_channel: "social", social_guard_status: "passed",
    social_guard_reasons: { finalDecision: "publicar", attempts: 0, issues: [], reparosAplicados: [], manual: true, observacao: "O Social Guard não foi rodado. O dono aprova no painel." },
    content_json: {
      format: "noticia", formato: "carousel", hashtags, origem: "feito à mão no chat",
      visual: { imageUrl: fotoCapa, attribution: creditoCapa, origem: "manual", fonte: creditoCapa },
      arte: { versao: "v2", variante: varianteDaCapa(true, "jornal"), gramatica: "jornal", artefato: artefatos[0], artefatos, bolha: false },
    },
  };
  const { data: ins, error: erro } = await client.from("social_posts").insert(linha).select("id").single();
  if (erro || !ins) throw new Error(`insert: ${erro?.message}`);
  const id = (ins as { id: string }).id;
  const hash = hashDoPostDaLinha({ caption, slides_manifest: linha.slides_manifest, content_json: linha.content_json });
  const ap = await enfileirar(projeto, {
    ramo: "post", pecaId: id, hash, publicarEm: quando,
    avisos: [{ codigo: "SOCIAL_GUARD_NAO_RODADO", detalhe: "Carrossel feito à mão: o Social Guard não foi rodado. Confira texto, fotos e crédito antes de aprovar." }],
    resumo: { titulo: headline, texto: caption, imagens: artefatos.map((a) => a.url as string), fonteUrl: null },
  }, depsDaFila(client, projeto));
  console.log(`gravado ${id}; na fila: ${ap ? ap.estado : "NÃO"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
