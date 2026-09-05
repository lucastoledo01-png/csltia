import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { extrairEntidades } from "../lib/server/editorial/classificador";
import { resolveVisualAsset } from "../lib/server/visual/resolver";
import { criarBiblioteca } from "../lib/server/visual/biblioteca";
import { identidadeDaPauta, renderEditionToHtml } from "../lib/server/newsroom/newsroom-service";
import type { EditionContent } from "../lib/server/newsroom/schemas";
import type { ResultadoVisual } from "../lib/server/visual/tipos";

/**
 * Preview da newsletter com a resolução por entidade.
 *
 * Parte de uma edição real já escrita, extrai as entidades das próprias
 * matérias e resolve a imagem de cada uma. Não publica, não envia e não grava
 * nada por padrão.
 *
 *   npx tsx src/scripts/preview-fase2.ts --edicao=arquivo.edicao.json
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

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? null;

  const arquivo = valor("edicao");
  if (!arquivo) {
    console.error("Informe --edicao=<arquivo .json com a edição>.");
    process.exit(1);
  }

  const bruto = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), arquivo), "utf-8")) as {
    edition: EditionContent;
  };
  const edicao = bruto.edition;

  console.log("=== PREVIEW DA FASE 2 ===");
  console.log(`edição: ${edicao.subject}`);
  console.log(`${edicao.stories.length} pautas\n`);

  // As entidades saem das próprias matérias, com o extrator da fase 1.
  const { entidades } = await extrairEntidades(
    edicao.stories.map((s, i) => ({
      id: String(i),
      titulo: s.title,
      resumo: `${s.summary} ${s.context ?? ""}`.slice(0, 800),
      fonte: s.source_name,
    }))
  );

  const client = getSupabaseAdminClient();
  let biblioteca = undefined;
  try {
    const { error } = await client.from("visual_assets").select("id").limit(1);
    if (!error) biblioteca = criarBiblioteca(client);
  } catch {
    /* sem biblioteca, o resto do caminho continua valendo */
  }

  const imagens = new Map<string, string>();
  const legendas = new Map<string, string>();
  const usados = new Set<string>();
  const resultados: ResultadoVisual[] = [];

  for (const [i, story] of edicao.stories.entries()) {
    const e = entidades.get(String(i)) ?? { atores: [], lugares: [], acontecimento: [] };
    const r = await resolveVisualAsset(
      {
        storyId: identidadeDaPauta(story),
        titulo: story.title,
        categoria: story.category,
        classificacao: e,
      },
      { client, biblioteca, jaUsadosNestaEdicao: usados, somenteLeitura: true }
    );

    resultados.push(r);

    console.log(`${i + 1}. ${story.title}`);
    console.log(`   entidade: ${r.entidade?.nome ?? "nenhuma"} (${r.entidade?.tipo ?? "n/d"})`);
    if (r.asset) {
      console.log(`   ${r.asset.source} | ${r.asset.license} | ${r.asset.width}x${r.asset.height} | score ${r.asset.imageRelevanceScore}`);
      console.log(`   ${r.asset.imageUrl.slice(0, 100)}`);
      console.log(`   crédito: ${r.asset.attribution || "não exigido"}`);
      imagens.set(identidadeDaPauta(story), r.asset.imageUrl);
      if (r.asset.attribution) legendas.set(identidadeDaPauta(story), r.asset.attribution);
    } else {
      console.log(`   SEM IMAGEM: ${r.motivo}`);
    }
  }

  const html = renderEditionToHtml(edicao, imagens, false, legendas);
  const destino = (valor("saida") ?? arquivo.replace(/\.json$/, "")) + ".fase2.html";
  fs.writeFileSync(
    path.resolve(process.cwd(), destino),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(edicao.subject)}</title></head><body>` +
      `<div style="max-width:680px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif;background:#F4F4F5;">` +
      `<p style="font:12px/1.5 system-ui;color:#555;margin:0 0 12px 0;"><strong>Assunto:</strong> ${esc(edicao.subject)}` +
      `<br><strong>Preheader:</strong> ${esc(edicao.preheader)}</p></div>` +
      html +
      `</body></html>`,
    "utf-8"
  );

  const comFoto = resultados.filter((r) => r.status === "SELECTED").length;
  console.log(`\n${comFoto} de ${edicao.stories.length} pautas com imagem`);
  console.log(`render em ${destino}`);
  console.log("Nada foi publicado, enviado ou gravado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
