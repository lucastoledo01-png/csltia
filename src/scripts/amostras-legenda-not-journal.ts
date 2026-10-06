import { writeFileSync, mkdirSync } from "node:fs";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import { DEFAULT_PROJECT_ID, getProjectById } from "../lib/server/projects";
import { pautaAvaliadaDoContexto, pautaDaCandidata } from "../lib/server/aprovacao/contexto-de-producao";
import { criarCandidatosStore, type CandidataPersistida } from "../lib/server/editorial/candidatos-store";
import type { PautaDoContexto } from "../lib/server/aprovacao/contrato";
import { determinarFormatoDaNoticia } from "../lib/server/social/carrossel/formato";
import { montarPacotesDasPautas } from "../lib/server/editorial/pacote-factual";
import { buscarTextoDaFonte } from "../lib/server/editorial/enriquecimento";
import type { PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { gerarPostDaPauta } from "../lib/server/social/gerador";
import { legendaDoInstagram, linhaDeCredito, hashtagsLigadasNoProjeto } from "../lib/server/social/legenda-final";
import type { DecisaoDeFormato } from "../lib/server/social/carrossel/formato";

/**
 * Amostras da legenda no método do Not Journal (06/10/2026), lado a lado com a
 * legenda que o post da mesma pauta tem hoje no banco.
 *
 * Banco só LIDO (SELECT em `social_posts` e `projects`). O modelo é chamado de
 * verdade, pelo mesmo `gerarPostDaPauta` da esteira, com a guarda e o laço de
 * reparo; o custo é somado e o script para antes de passar do teto.
 *
 *   npx tsx src/scripts/amostras-legenda-not-journal.ts [--teto 1] [--n 4] [--saida <arquivo>]
 */

type Linha = Record<string, unknown>;

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
}

function palavras(t: string): number {
  return t.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

async function main(): Promise<void> {
  carregarEnv();
  const teto = Number(argumento("--teto") ?? 1);
  const n = Number(argumento("--n") ?? 4);
  const saida = argumento("--saida") ?? "docs/design/legenda-not-journal-2026-10-06/amostras.md";
  const cliente = clienteDoBanco();
  // `--so "united,los angeles"`: só as pautas cujo título contém um dos trechos.
  const so = (argumento("--so") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

  const projeto = await getProjectById(DEFAULT_PROJECT_ID);
  if (!projeto) throw new Error("projeto não encontrado");

  /*
   * Os posts recentes, uma pauta por post. O pacote factual e a classificação
   * vêm da candidata gravada em `news_candidates` (só leitura), que é o que o
   * gerador leu quando o post nasceu.
   */
  const { data, error } = await cliente
    .from("social_posts")
    .select("id, edition_date, title, caption, status, story_id, content_json, created_at")
    .eq("project_id", projeto.id)
    .not("story_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  const linhas = (data ?? []) as Linha[];
  const ids = [...new Set(linhas.map((l) => String(l.story_id)))];
  const candidatas = await criarCandidatosStore(cliente).buscarPorStoryIds(projeto.id, ids);

  /*
   * O pacote factual não fica gravado na candidata (medido em 06/10/2026: a
   * coluna está vazia nas pautas recentes). Ele é montado aqui como a esteira
   * monta: o texto da fonte, lido de novo com o agente honesto, e o mesmo
   * extrator barato. O custo entra na conta do teto.
   */
  let custoDosPacotes = 0;
  const vistas = new Set<string>();
  const escolhidas: Array<{ linha: Linha; pc: PautaDoContexto; pauta: ReturnType<typeof pautaAvaliadaDoContexto>; pacote: PacoteFactual; candidata: CandidataPersistida }> = [];
  for (const linha of linhas) {
    const id = String(linha.story_id);
    const c = candidatas.get(id);
    if (!c || vistas.has(id)) continue;
    if (so.length && !so.some((t) => c.title.toLowerCase().includes(t))) continue;
    // Pauta de imigração saiu da linha em 05/10/2026: não serve de amostra.
    if ((c.classificacao as { imigracao?: boolean } | null)?.imigracao) continue;
    vistas.add(id);
    const pc = pautaDaCandidata(c);
    let pacote = c.factualPackage;
    if (!pacote) {
      const fonte = await buscarTextoDaFonte(pc.url);
      const texto = fonte?.texto && fonte.texto.length > pc.resumo.length ? fonte.texto : pc.resumo;
      if (texto.length < 600) continue;
      const r = await montarPacotesDasPautas([{ url: pc.url, titulo: pc.titulo, texto, urls: [pc.url] }]);
      custoDosPacotes += r.custoUsd;
      pacote = r.pacotes.get(pc.url) ?? null;
      if (!pacote) continue;
      pc.resumo = texto.slice(0, 4000);
    }
    const pauta = pautaAvaliadaDoContexto(pc, c);
    /*
     * A candidata não guarda a data de publicação da fonte, e a remontagem
     * põe "agora" no lugar. Na guarda, a data de publicação autoriza o quando
     * do lide; "agora" autorizaria o dia em que a amostra roda, que é
     * justamente o erro que a régua do quando existe para pegar.
     */
    pauta.grupo.primary.published_at = "";
    escolhidas.push({ linha, pc, pauta, pacote, candidata: c });
    if (escolhidas.length >= n) break;
  }

  const marca = {
    nome: projeto.brand.displayName || projeto.name,
    nicho: projeto.niche,
    extra: projeto.editorialPromptExtra ?? "",
    keyword: "",
    hashtags: hashtagsLigadasNoProjeto(projeto.settings),
  };

  let custo = custoDosPacotes;
  const blocos: string[] = [];
  for (const [i, e] of escolhidas.entries()) {
    if (custo >= teto * 0.85) {
      console.log(`teto de custo perto (${custo.toFixed(3)} USD): parei antes da amostra ${i + 1}`);
      break;
    }
    const cj = (e.linha.content_json ?? {}) as Linha;
    const { pc, pauta } = e;
    const forma = (cj.carrossel ?? {}) as Linha;
    /*
     * A primeira amostra cuja pauta rende carrossel vai como carrossel, para o
     * contrato da legenda do carrossel aparecer também; as outras, peça única.
     */
    const talvez = determinarFormatoDaNoticia(e.pacote);
    const decisao: DecisaoDeFormato | null =
      talvez.formato === "carousel" && !blocos.some((b) => b.includes("| carrossel")) ? talvez : null;

    const r = await gerarPostDaPauta(pauta, 1, {
      marca,
      pacotes: new Map([[pc.storyId, e.pacote]]),
      /*
       * A pauta já foi ao ar no feed, então passou pela verificação de
       * finalista naquele dia; a candidata gravada é que não guarda o
       * veredito. Sem isto a guarda recusa por SOCIAL_REJECT_UNVERIFIED, que
       * não é o que a amostra quer medir.
       */
      candidatas: new Map([
        [pc.storyId, { ...e.candidata, status: "approved", verificacao: { status: "confirm", motivo: "post já publicado" } } as CandidataPersistida],
      ]),
      decidirCarrossel: decisao ? () => decisao : undefined,
    });
    const tokens = r.post?.tokens ?? r.descarte?.tokens ?? 0;
    custo += r.post?.custoUsd ?? r.descarte?.custoUsd ?? tokens * 0.00001;

    const visual = (cj.visual ?? {}) as Linha;
    const fotos = (((forma.fotos ?? []) as Array<Linha | null>) ?? []).map((f) =>
      f ? { author: String(f.author ?? ""), license: String(f.license ?? ""), attribution: String(f.attribution ?? "") } : null,
    );
    const credito = linhaDeCredito([
      { author: String(visual.author ?? ""), license: String(visual.license ?? ""), attribution: String(visual.attribution ?? "") },
      ...fotos,
    ]);
    const nova = r.post ? legendaDoInstagram(r.post.veredicto.legendaFinal, { hashtags: "manter", credito }) : "";

    console.log(`[${i + 1}] ${pc.titulo.slice(0, 70)}: ${r.post ? "ok" : `descartada: ${r.descarte?.motivo}`}`);
    blocos.push(
      [
        `## ${i + 1}. ${pc.titulo}`,
        "",
        `Fonte: ${pc.fonteNome} | edição ${String(e.linha.edition_date)} | ${decisao ? `carrossel (${decisao.estrutura})` : "peça única"} | post \`${String(e.linha.id)}\``,
        "",
        `Manchete nova: **${r.post?.copy.headline ?? "(descartada)"}**`,
        "",
        "### Legenda atual (no banco)",
        "",
        "```text",
        String(e.linha.caption ?? "").trim(),
        "```",
        "",
        `${palavras(String(e.linha.caption ?? ""))} palavras.`,
        "",
        "### Legenda nova (método do Not Journal)",
        "",
        r.post
          ? ["```text", nova, "```", "", `${palavras(nova)} palavras; ${r.post.tentativas} reescrita(s) pela guarda.`].join("\n")
          : `Descartada: ${r.descarte?.motivo ?? "sem motivo"}`,
        "",
        ...(r.post && r.post.reparosAplicados.length
          ? [
              "O que a guarda mandou reescrever no caminho:",
              "",
              ...r.post.reparosAplicados.flat().map((p) => `- ${p.motivo}: ${p.detalhe}`),
              "",
            ]
          : []),
      ].join("\n"),
    );
  }

  mkdirSync(saida.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(
    saida,
    [
      "# A legenda no método do Not Journal: amostras (06/10/2026)",
      "",
      `Gerado por \`npx tsx src/scripts/amostras-legenda-not-journal.ts\`, com pautas reais aprovadas lidas de \`social_posts\` (banco só lido), pelo mesmo gerador e a mesma guarda da esteira, com o código desta branch. Custo do modelo: ${custo.toFixed(3)} USD.`,
      "",
      "A legenda atual é a que está gravada no post da mesma pauta. A nova sai com o fecho e a linha de crédito montados em código (`legenda-final.ts`); o crédito vem do autor gravado nas fotos do post.",
      "",
      ...blocos,
    ].join("\n"),
  );
  console.log(`\n${blocos.length} amostra(s) em ${saida}; custo ${custo.toFixed(3)} USD`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
