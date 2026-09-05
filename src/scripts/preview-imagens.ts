import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { paraRenderizacao, resolverImagens } from "../lib/server/editorial/imagens";
import { identidadeDaPauta, renderEditionToHtml } from "../lib/server/newsroom/newsroom-service";
import { bancoConfigurado } from "../lib/server/prompt-system/stock";
import type { EditionContent } from "../lib/server/newsroom/schemas";
import type { NewsCandidate } from "../lib/server/newsroom/collector";

/**
 * Só o caminho de imagem e a renderização, a partir de uma edição já escrita.
 *
 * Existe porque conferir escolha de foto não deveria custar uma redação
 * inteira, e porque a chave do banco de imagem pode não estar na máquina em
 * que a edição foi gerada.
 *
 * Chama `resolverImagens` e `renderEditionToHtml`, que são as mesmas funções
 * que o pipeline chama. Não grava no banco, não publica e não envia.
 *
 *   npx tsx src/scripts/preview-imagens.ts --edicao=relatorio.edicao.json
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

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? null;

  const arquivo = valor("edicao");
  if (!arquivo) {
    console.error("Informe --edicao=<arquivo .edicao.json gerado pelo relatório>.");
    process.exit(1);
  }

  const bruto = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), arquivo), "utf-8")) as {
    edition: EditionContent;
    selectedCandidates: NewsCandidate[];
    gerado_em: string;
  };

  const config = carregarConfigEditorial();
  const store = criarHistoricoStore(getSupabaseAdminClient());
  const historico = await store.janela(DEFAULT_PROJECT_ID, config.janelaDeImagemEmDias);

  console.log("=== PREVIEW DE IMAGEM E RENDERIZAÇÃO ===");
  console.log(`edição gerada em ${bruto.gerado_em}`);
  console.log(
    `banco de imagem: ${bancoConfigurado() ? "configurado" : "SEM CHAVE nesta máquina, só a reserva do feed será exercitada"}`
  );
  console.log(`histórico consultado: ${historico.length} registros, janela de ${config.janelaDeImagemEmDias} dias\n`);

  const escolhas = await resolverImagens(
    bruto.edition.stories.map((story, i) => ({
      titulo: story.title,
      categoria: story.category,
      sourceUrl: story.source_url,
      imagemDoFeed: bruto.selectedCandidates[i]?.image_url ?? "",
    })),
    { historico, janelaEmDias: config.janelaDeImagemEmDias }
  );

  bruto.edition.stories.forEach((story, i) => {
    const id = identidadeDaPauta(story);
    const e = escolhas.get(id);
    console.log(`${i + 1}. ${story.title}`);
    console.log(`   story_id: ${id}`);
    console.log(`   image_url: ${e?.imagemUrl || "nenhuma"}`);
    console.log(`   image_source: ${e?.imageSource ?? "nenhuma"}`);
    console.log(`   identidade da foto: ${e?.imagemCanonica || "n/d"}`);
    console.log(`   motivo: ${e?.motivo ?? "n/d"}`);
    console.log(`   já usada antes: ${e?.descartadaPorRepeticao ?? "não"}`);
    console.log(
      `   crédito: ${e?.credito ? `${e.credito.provedor}, ${e.credito.fotografo}` : "não exigido ou inexistente"}`
    );
  });

  const comFoto = [...escolhas.values()].filter((e) => e.imagemUrl);
  const distintas = new Set(comFoto.map((e) => e.imagemCanonica));
  console.log(`\ncom foto: ${comFoto.length} de ${bruto.edition.stories.length}`);
  console.log(`fotos distintas: ${distintas.size}`);

  const html = renderEditionToHtml(bruto.edition, paraRenderizacao(escolhas));
  const destino = (valor("saida") ?? arquivo.replace(/\.edicao\.json$/, "")) + ".preview.html";
  fs.writeFileSync(
    path.resolve(process.cwd(), destino),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
      `<title>${esc(bruto.edition.subject)}</title></head><body>` +
      `<div style="max-width:680px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif;background:#F4F4F5;">` +
      `<p style="font:12px/1.5 system-ui;color:#555;margin:0 0 12px 0;">` +
      `<strong>Assunto:</strong> ${esc(bruto.edition.subject)}<br>` +
      `<strong>Preheader:</strong> ${esc(bruto.edition.preheader)}</p></div>` +
      html +
      `</body></html>`,
    "utf-8"
  );

  console.log(`\nrender salvo em ${destino}`);
  console.log("Nada foi gravado no banco, publicado ou enviado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
