import fs from "node:fs";
import path from "node:path";
import { editoriaPeloNome, hrefDaEditoria } from "../lib/editorias";
import { buscarTextoDaFonte } from "../lib/server/editorial/enriquecimento";
import { montarPacoteFactual, type PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { estruturaDaMateria } from "../lib/server/estrutura-da-materia";
import { comInstrucoesDoProjeto } from "../lib/server/instrucoes";
import { getProjectById, DEFAULT_PROJECT_ID } from "../lib/server/projects";
import { escreverArtigoDaPauta, palavrasDoCorpo, renderizarArtigoHtml, type Artigo, type ResultadoDoArtigo } from "../lib/server/ramos/artigo";
import { criarLivroDeCustos } from "../lib/server/ramos/custos";
import { reunirFontesDaMateria } from "../lib/server/ramos/fontes-da-materia";
import { candidatasComVetor } from "../lib/server/ramos/materia-profunda";
import { vozesDosRamos } from "../lib/server/ramos/vozes";
import { argumento, carregarEnv, clienteDoBanco } from "./artigos-comum";

/**
 * A medida da matéria profunda (06/10/2026), SEM GRAVAR NADA.
 *
 *   npx tsx src/scripts/medir-materia-profunda.ts [--n 4] [--slug <slug publicado>] [--saida <arq.json>]
 *
 * Para cada pauta (as `--n` aprovadas mais recentes de `news_candidates`, fora
 * imigração, mais a matéria publicada de `--slug`, por padrão a de Chicago),
 * escreve DUAS vezes com o redator do ramo do portal, mesma voz, mesmo
 * auditor, mesma poda:
 *
 *   antes   com o pacote de UMA fonte, como o ramo fazia;
 *   depois  com o pacote das fontes do mesmo fato (`reunirFontesDaMateria`).
 *
 * E mede o que a auditoria de estrutura mede: palavras do corpo (sem
 * perguntas nem o bloco de tópicos) e se o "O que você precisa saber"
 * sobreviveu às regras. O modelo é chamado e o custo é real; o banco só é
 * lido. O redator é um modelo: cada rodada dá outro texto, então a medida é de
 * tendência, não de exatidão.
 */

type Alvo = { rotulo: string; url: string; titulo: string; veiculo: string; eixo: string; vetor: number[] | null; quando: Date; pacote?: PacoteFactual };

type Medida = {
  fontes: string[];
  aprovada: boolean;
  palavrasDoCorpo: number;
  palavrasNaEstrutura: number;
  essencial: boolean;
  apagadas: number;
  bloqueios: string[];
  titulo: string;
  html: string;
};

const PADRAO_CHICAGO = "chicago-propoe-um-ano-sem-novos-data-centers-na-cidade-2026-09-24";

function vetor(e: unknown): number[] | null {
  if (Array.isArray(e)) return e as number[];
  if (typeof e === "string" && e.startsWith("[")) {
    try {
      return JSON.parse(e) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

async function alvos(client: ReturnType<typeof clienteDoBanco>, n: number, slug: string | null): Promise<Alvo[]> {
  const lista: Alvo[] = [];
  const { data } = await client
    .from("news_candidates")
    .select("url, canonical_url, title, source_domain, editorial_axis, is_immigration, embedding, factual_package, published_at")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .eq("status", "approved")
    .not("embedding", "is", null)
    .order("published_at", { ascending: false })
    .limit(40);
  const vistos = new Set<string>();
  for (const c of (data ?? []) as Array<Record<string, unknown>>) {
    if (lista.length >= n) break;
    if (c.is_immigration === true || c.editorial_axis === "imigracao") continue;
    const url = String(c.canonical_url || c.url || "");
    const dominio = String(c.source_domain ?? "");
    if (!url || /news\.google\.com/.test(url) || vistos.has(dominio + String(c.title))) continue;
    vistos.add(dominio + String(c.title));
    const pacote = c.factual_package && typeof c.factual_package === "object" ? (c.factual_package as PacoteFactual) : undefined;
    lista.push({
      rotulo: String(c.title).slice(0, 70),
      url,
      titulo: String(c.title),
      veiculo: dominio,
      eixo: String(c.editorial_axis ?? ""),
      vetor: vetor(c.embedding),
      quando: new Date(String(c.published_at)),
      ...(pacote?.verified_facts?.length ? { pacote } : {}),
    });
  }
  if (slug) {
    const { data: a } = await client.from("articles").select("slug, title, category, source_urls, published_at").eq("slug", slug).maybeSingle();
    const url = ((a?.source_urls as string[] | null) ?? [])[0];
    if (a && url) {
      const { data: cand } = await client
        .from("news_candidates")
        .select("embedding, source_domain")
        .eq("project_id", DEFAULT_PROJECT_ID)
        .or(`url.eq.${url},canonical_url.eq.${url}`)
        .limit(1)
        .maybeSingle();
      lista.push({
        rotulo: `${a.slug} (publicada)`,
        url,
        titulo: String(a.title),
        veiculo: String(cand?.source_domain ?? ""),
        eixo: String(a.category ?? ""),
        vetor: vetor(cand?.embedding),
        quando: new Date(String(a.published_at)),
      });
    }
  }
  return lista;
}

async function escrever(
  alvo: Alvo,
  pacote: PacoteFactual,
  veiculo: string,
  marca: { nome: string; nicho: string; briefing: string; voz: string },
  livro: ReturnType<typeof criarLivroDeCustos>,
): Promise<Medida> {
  const r: ResultadoDoArtigo = await escreverArtigoDaPauta(
    { classificacao: { pais: "EUA", eixo: alvo.eixo }, grupo: { primary: { source_name: veiculo } } },
    pacote,
    marca,
    { livro },
  );
  const fontes = pacote.fontes?.length ? pacote.fontes.map((f) => `${f.id} ${f.nome}`) : [veiculo];
  if (!r.artigo) return { fontes, aprovada: false, palavrasDoCorpo: 0, palavrasNaEstrutura: 0, essencial: false, apagadas: 0, bloqueios: r.veredicto.bloqueios, titulo: "", html: "" };
  const artigo: Artigo = r.artigo;
  const editoria = editoriaPeloNome(alvo.eixo);
  const html = renderizarArtigoHtml(artigo, { nome: veiculo, url: alvo.url }, {
    fontes: pacote.fontes?.length ? pacote.fontes.map((f) => ({ nome: f.nome, url: f.url })) : [{ nome: veiculo, url: alvo.url }],
    ...(pacote.fontes?.length ? { fontesDoTexto: pacote.fontes.map((f) => ({ id: f.id, nome: f.nome, url: f.url })) } : {}),
    ...(editoria ? { editoria: { nome: editoria.nome, href: hrefDaEditoria(editoria.id) } } : {}),
  });
  const e = estruturaDaMateria({ slug: "ensaio", title: artigo.titulo, content_html: html });
  return {
    fontes,
    aprovada: r.veredicto.aprovado,
    palavrasDoCorpo: palavrasDoCorpo(artigo),
    palavrasNaEstrutura: e.palavras,
    essencial: e.essencial,
    apagadas: (r.removidas ?? []).length,
    bloqueios: r.veredicto.bloqueios,
    titulo: artigo.titulo,
    html,
  };
}

async function main(): Promise<void> {
  carregarEnv();
  const n = Number(argumento("--n") ?? 4);
  const slug = argumento("--slug") ?? PADRAO_CHICAGO;
  const saida = argumento("--saida");
  console.log("MODO: MEDIDA (o modelo é chamado e o custo é real; NADA é gravado no banco)");
  const client = clienteDoBanco();
  const projeto = await getProjectById(DEFAULT_PROJECT_ID);
  if (!projeto) throw new Error("projeto padrão não encontrado");
  const livro = criarLivroDeCustos();
  const resultados: Array<{ alvo: string; antes: Medida; depois: Medida; linhas: string[] }> = [];

  for (const alvo of await alvos(client, n, slug)) {
    console.log(`\n== ${alvo.rotulo}\n   ${alvo.url}`);
    const notas: string[] = [];
    const lida = await buscarTextoDaFonte(alvo.url, fetch, notas);
    // O pacote gravado pela produção, quando há; o texto de origem dele é o que a ancoragem confere.
    let pacote = alvo.pacote
      ? { ...alvo.pacote, source_urls: alvo.pacote.source_urls ?? [alvo.url], texto_de_origem: alvo.pacote.texto_de_origem || lida?.texto || "" }
      : undefined;
    const veiculo = (lida?.metadados.veiculo || alvo.veiculo || "a fonte").trim();
    if (!pacote) {
      if (!lida) {
        console.log(`   fonte não alcançada (${notas.join("; ")}); pula`);
        continue;
      }
      const p = await montarPacoteFactual({ titulo: lida.metadados.titulo || alvo.titulo, texto: lida.texto, urls: [alvo.url] });
      livro.lancar("pacote_factual", "comum", p.custoUsd, p.tokens);
      pacote = p.pacote;
    }
    const ampliado = await reunirFontesDaMateria({
      principal: { url: alvo.url, titulo: alvo.titulo, nome: veiculo, vetor: alvo.vetor, pacote },
      candidatas: await candidatasComVetor(client, DEFAULT_PROJECT_ID, new Date(alvo.quando.getTime() - 3 * 86_400_000), new Date(alvo.quando.getTime() + 2 * 86_400_000)),
      ...(lida ? { linksOficiais: lida.linksOficiais ?? [] } : {}),
      livro,
    });
    for (const l of ampliado.linhasDeLog) console.log(`   ${l}`);

    const marca = await comInstrucoesDoProjeto(projeto, async () => ({
      nome: projeto.brand.displayName || projeto.name,
      nicho: projeto.niche,
      briefing: projeto.editorialPromptExtra ?? "",
      voz: (await vozesDosRamos(projeto.id)).artigo,
    }));
    const antes = await comInstrucoesDoProjeto(projeto, () => escrever(alvo, pacote, veiculo, marca, livro));
    const depois =
      ampliado.fontes.length > 1 ? await comInstrucoesDoProjeto(projeto, () => escrever(alvo, ampliado.pacote, veiculo, marca, livro)) : antes;
    const linha = (m: Medida) =>
      `${m.aprovada ? "aprovada" : "BLOQUEADA"}, ${m.palavrasNaEstrutura} palavras (auditoria), ${m.palavrasDoCorpo} no corpo, essencial ${m.essencial ? "SIM" : "não"}, ${m.apagadas} apagada(s), fontes: ${m.fontes.join(" | ")}`;
    console.log(`   ANTES   ${linha(antes)}`);
    console.log(`   DEPOIS  ${ampliado.fontes.length > 1 ? linha(depois) : "(nenhuma outra fonte lida: igual ao antes)"}`);
    resultados.push({ alvo: alvo.rotulo, antes, depois, linhas: ampliado.linhasDeLog });
  }

  console.log("\n== Resumo");
  console.log("| Pauta | Fontes | Palavras antes | Palavras depois | Essencial antes | Essencial depois |");
  console.log("|---|---|---|---|---|---|");
  for (const r of resultados) {
    console.log(
      `| ${r.alvo} | ${r.depois.fontes.length} | ${r.antes.palavrasNaEstrutura} | ${r.depois.palavrasNaEstrutura} | ${r.antes.essencial ? "sim" : "não"} | ${r.depois.essencial ? "sim" : "não"} |`,
    );
  }
  console.log(`\ncusto medido: US$ ${livro.total().toFixed(4)}`);
  if (saida) {
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    fs.writeFileSync(saida, `${JSON.stringify(resultados, null, 2)}\n`);
    console.log(`resultado em ${saida} (arquivo local; o banco não foi tocado)`);
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
