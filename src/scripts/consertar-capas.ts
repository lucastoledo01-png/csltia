import { creditoCompleto, htmlDoCredito, legendaNeutra, textoDoCredito } from "../lib/credito-da-capa";
import { enderecoLimpoDaImagem, semImagemDaCapaNoCorpo } from "../lib/imagem-da-capa";
import { indexacaoValidadaDoArtigo } from "../lib/indexacao-do-artigo";
import { resolverCreditoDaCapa } from "../lib/server/capa-da-materia";
import { conferenciaDaCapa } from "../lib/server/estrutura-da-materia";
import { avisarBuscadores } from "../lib/server/indexnow";
import { htmlDaLegenda } from "../lib/server/legenda-da-capa";
import { carregarEnv, clienteDoBanco, type LinhaDoArtigo } from "./artigos-comum";
import { criarFilaStore } from "../lib/server/aprovacao/fila-store";
import { criarAdaptadorSupabase } from "../lib/server/aprovacao/pecas-supabase";
import { decidirManutencaoNaFila, gravarComAFila } from "../lib/server/aprovacao/manutencao";
import type { ProjetoDaFila } from "../lib/server/aprovacao/fila";

/**
 * Conserta a capa das matérias já gravadas (06/10/2026): endereço sem `&amp;`,
 * legenda e crédito com autor, licença e link.
 *
 *   npx tsx src/scripts/consertar-capas.ts                  ensaio: mostra o que mudaria, não grava
 *   npx tsx src/scripts/consertar-capas.ts --aplicar        grava cover_image e content_html
 *   --incluir-agendadas                                     também as `scheduled` (ver abaixo)
 *
 * O ENSAIO É O PADRÃO, e só lê: o banco e o GET no Commons e no Pexels.
 *
 * O que muda, e só isso:
 * - `cover_image` desfeito de `&amp;` e `&amp%3B` (a página já desenhava
 *   limpo; o banco continuava torto para quem lê a coluna);
 * - um `<p class="credito-da-foto">` com autor, licença, link e medida, só
 *   quando a origem respondeu com o crédito COMPLETO. Crédito pela metade não
 *   é gravado: gravado, ele faria a página parar de perguntar à origem;
 * - um `<p class="legenda-da-capa">` neutro ("Imagem ilustrativa: <assunto>."),
 *   só quando não há legenda. Descrever a foto pede a conferência visual, que
 *   custa chamada de modelo: é o `reescrever-artigo.ts`, matéria a matéria.
 *
 * `updated_at` NÃO muda: ele vira o `dateModified` do NewsArticle e o
 * `lastmod` do sitemap, e crédito de foto não é mudança de conteúdo.
 *
 * Por padrão só `published`. A `scheduled` está, ou vai estar, na fila de
 * aprovação, cujo hash cobre o HTML e a capa: mexer nela depois de aprovada a
 * seguraria. Com `--incluir-agendadas`, o dono sabe disso.
 *
 * ATUALIZADO em 06/10/2026: `published` também pode estar na fila. Com a fila
 * em `dry_run` a matéria vai ao ar no horário e continua `aguardando`, e foi
 * assim que este script, rodado pelo Claude nesse dia, quebrou a aprovação da
 * matéria do diesel: o HTML mudou e o hash da fila deixou de bater. Agora
 * TODA matéria é conferida na fila antes de gravar, pelas regras de
 * `aprovacao/manutencao.ts`: aguardando reentra com o hash novo, refazendo e
 * aprovada sem liberar são puladas com o motivo.
 */

type Patch = { cover_image?: string; content_html?: string };

async function planejar(a: LinhaDoArtigo): Promise<{ patch: Patch; notas: string[] }> {
  const notas: string[] = [];
  const patch: Patch = {};
  const bruta = (a.cover_image ?? "").trim();
  if (!bruta) return { patch, notas: ["sem capa: nada a fazer"] };
  const capa = enderecoLimpoDaImagem(bruta);
  if (capa !== bruta) {
    patch.cover_image = capa;
    notas.push(`capa: ${bruta}\n        -> ${capa}`);
  }

  let html = a.content_html ?? "";
  const lido = semImagemDaCapaNoCorpo(html, capa);
  const acrescimos: string[] = [];
  if (!lido.legendaDaCapa) {
    const assunto =
      indexacaoValidadaDoArtigo({ title: a.title, content_html: a.content_html, category: a.category, tags: a.tags }).assuntos[0] ?? a.category ?? "";
    const legenda = legendaNeutra(assunto);
    acrescimos.push(htmlDaLegenda(legenda));
    notas.push(`legenda: (nenhuma) -> "${legenda}"`);
  }
  if (!lido.creditoDaCapa) {
    const credito = await resolverCreditoDaCapa(capa);
    if (credito && creditoCompleto(credito)) {
      acrescimos.push(htmlDoCredito(credito));
      notas.push(`crédito: (nenhum) -> "${textoDoCredito(credito)}" ${credito.href}${credito.largura ? ` [${credito.largura}x${credito.altura}]` : ""}`);
    } else {
      notas.push(
        `crédito: PENDENTE, a origem não deu autor e licença (${credito ? textoDoCredito(credito) : "nada"}); a página segue resolvendo na hora`,
      );
    }
  }
  if (acrescimos.length) {
    // Legenda e crédito na frente: é de lá que a página os tira para desenhar embaixo da capa.
    html = `${acrescimos.join("")}${html}`;
    patch.content_html = html;
  }
  return { patch, notas };
}

async function main(): Promise<void> {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const status = process.argv.includes("--incluir-agendadas") ? ["published", "scheduled"] : ["published"];
  console.log(aplicar ? "MODO: APLICAR (grava cover_image e content_html)" : "MODO: ENSAIO (nada é gravado)");
  const client = clienteDoBanco();
  const { data, error } = await client
    .from("articles")
    .select("id, slug, title, status, project_id, category, cover_image, content_html, tags, published_at, updated_at")
    .in("status", status)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`não consegui ler os artigos: ${error.message}`);
  const linhas = (data ?? []) as LinhaDoArtigo[];

  // O projeto de cada matéria, para a fila saber o modo dela (`settings.capacidades.aprovacao`).
  const projetos = new Map<string, ProjetoDaFila>();
  const ids = [...new Set(linhas.map((l) => l.project_id).filter(Boolean))];
  if (ids.length) {
    const { data: ps, error: erroDosProjetos } = await client.from("projects").select("id, timezone, settings").in("id", ids);
    if (erroDosProjetos) throw new Error(`não consegui ler os projetos: ${erroDosProjetos.message}`);
    for (const p of (ps ?? []) as Array<{ id: string; timezone?: string | null; settings?: Record<string, unknown> | null }>) {
      projetos.set(p.id, { id: p.id, timezone: p.timezone || "America/Sao_Paulo", settings: p.settings ?? null });
    }
  }
  const store = criarFilaStore(client);

  const gravadas: Array<{ projectId: string; slug: string }> = [];
  for (const a of linhas) {
    const { patch, notas } = await planejar(a);
    console.log(`\n${a.slug} (${a.status})`);
    for (const n of notas) console.log(`  ${n}`);
    if (Object.keys(patch).length === 0) {
      console.log("  nada muda");
      continue;
    }
    const depois = conferenciaDaCapa({ ...a, ...patch });
    console.log(`  depois: ${depois.problemas.length ? depois.problemas.join("; ") : "sem problema de capa gravado"}`);

    /*
     * A fila, antes de gravar, inclusive no ensaio: o ensaio tem de dizer que
     * a matéria seria pulada, e não só o aplicar.
     */
    const projeto = projetos.get(a.project_id);
    if (!a.id || !projeto) {
      console.log("  PULADA: sem id ou sem projeto, não dá para conferir a fila de aprovação");
      continue;
    }
    if (!aplicar) {
      console.log(`  fila: ${decidirManutencaoNaFila(await store.porPeca(projeto.id, "artigo", a.id)).motivo}`);
      continue;
    }
    const desfecho = await gravarComAFila({
      projeto,
      ramo: "artigo",
      pecaId: a.id,
      deps: { store, pecas: criarAdaptadorSupabase(client, projeto) },
      gravar: async () => {
        const { error: erroDeGravacao } = await client
          .from("articles")
          .update(patch)
          .eq("id", a.id ?? "")
          .eq("slug", a.slug)
          // A trava contra corrida: se o status mudou entre ler e gravar, nada acontece.
          .eq("status", a.status);
        return erroDeGravacao ? erroDeGravacao.message : null;
      },
    });
    console.log(`  ${desfecho.gravou ? "gravada; " : ""}fila: ${desfecho.motivo}`);
    if (desfecho.gravou && a.status === "published") gravadas.push({ projectId: a.project_id, slug: a.slug });
  }

  if (!aplicar) {
    console.log("\nENSAIO: nada foi gravado. Rode com --aplicar para gravar.");
    return;
  }
  // A página publicada mudou: os buscadores que aceitam IndexNow ficam sabendo.
  for (const projectId of new Set(gravadas.map((g) => g.projectId))) {
    const r = await avisarBuscadores(client, projectId, gravadas.filter((g) => g.projectId === projectId).map((g) => g.slug), "capa consertada");
    console.log(`IndexNow: ${r.situacao}${r.detalhe ? ` (${r.detalhe})` : ""}`);
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
