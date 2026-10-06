import fs from "node:fs";
import path from "node:path";
import { editoriaPeloNome, hrefDaEditoria } from "../lib/editorias";
import { descreverDescartes, tagsDeIndexacao, tagsSemIndexacao, type EntidadeDaMateria } from "../lib/indexacao-do-artigo";
import { ajustarMateriaGravada } from "../lib/server/ajuste-de-materia";
import { normalizarDescricao, DESCRICAO_MAXIMA, DESCRICAO_MINIMA } from "../lib/server/auditoria-de-artigo";
import { descricaoPorRegra, tituloDeBuscaPorRegra } from "../lib/server/correcao-de-artigo";
import { buscarTextoDaFonte } from "../lib/server/editorial/enriquecimento";
import { montarPacoteFactual, type PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { comInstrucoesDoProjeto } from "../lib/server/instrucoes";
import { htmlDaLegenda, legendaDaFoto, legendaNeutra } from "../lib/server/legenda-da-capa";
import { buscarRelacionadas } from "../lib/server/materias-relacionadas";
import { getProjectById } from "../lib/server/projects";
import {
  escreverArtigoDaPauta,
  indexacaoDoArtigoEscrito,
  palavrasDoHtml,
  renderizarArtigoHtml,
  secoesParaConteudo,
  semMarcadorDeLink,
  type Artigo,
} from "../lib/server/ramos/artigo";
import { criarLivroDeCustos } from "../lib/server/ramos/custos";
import { vozesDosRamos } from "../lib/server/ramos/vozes";
import { conferirImagem } from "../lib/server/visual/conferencia-visual";
import { resolverEntidadeNoWikidata } from "../lib/server/visual/wikidata";
import { argumento, carregarEnv, clienteDoBanco, type LinhaDoArtigo } from "./artigos-comum";
import { creditoCompleto, htmlDoCredito } from "../lib/credito-da-capa";
import { enderecoLimpoDaImagem } from "../lib/imagem-da-capa";
import { resolverCreditoDaCapa } from "../lib/server/capa-da-materia";
import { avisarBuscadores } from "../lib/server/indexnow";
import { reunirFontesDaMateria } from "../lib/server/ramos/fontes-da-materia";
import { candidatasComVetor } from "../lib/server/ramos/materia-profunda";

/**
 * Reescreve UMA matéria publicada no molde de matéria completa (06/10/2026),
 * a partir da FONTE ORIGINAL, e não do resumo da newsletter.
 *
 *   npx tsx src/scripts/reescrever-artigo.ts --so <slug>                       ensaio: imprime tudo, não grava
 *   npx tsx src/scripts/reescrever-artigo.ts --so <slug> --saida <arq.json>    ensaio, e guarda o resultado
 *   npx tsx src/scripts/reescrever-artigo.ts --so <slug> --aplicar --de <arq>  grava EXATAMENTE o que foi revisado
 *   npx tsx src/scripts/reescrever-artigo.ts --so <slug> --aplicar             reescreve de novo e grava
 *   --trocar-titulo                                                            aceita o título do redator
 *   --uma-fonte                                                                só a fonte original, sem as outras do mesmo fato
 *   npx tsx src/scripts/reescrever-artigo.ts --so <slug> --so-ajustes [--aplicar]
 *       SEM modelo: aplica à matéria GRAVADA as regras do "O que você precisa
 *       saber" e recalcula assuntos e entidades pelo validador. Grava só
 *       content_html, tags e updated_at. É o caminho para a versão que o dono
 *       já leu receber as regras novas sem virar outro texto (06/10/2026).
 *
 * O ensaio chama o modelo e o custo é real. `--de` existe porque o redator é
 * um modelo: rodar de novo para gravar daria OUTRO texto, e o que vai ao ar
 * tem que ser o que alguém leu.
 *
 * O caminho: busca a fonte de novo (`buscarTextoDaFonte`: a página do veículo
 * e, se ele recusar o robô, a cópia do Internet Archive da mesma página),
 * monta o pacote factual, escreve no molde com o redator do ramo do portal
 * (mesma instrução, mesmo auditor, mesma poda), acrescenta os links internos,
 * descreve a foto da capa e grava. Nunca muda slug, capa nem data de
 * publicação.
 */

type Resultado = {
  slug: string;
  fonte: { url: string; via: string; urlLida: string; notas: string[] };
  pacote: PacoteFactual;
  artigo: Artigo;
  tituloFinal: string;
  removidas: Array<{ id: string; motivo: string; texto: string }>;
  avisos: string[];
  patch: Record<string, unknown>;
  contagem: { palavras: number; palavrasDoTexto: number; linksNoTexto: number; linksInternos: number; linksDeFonte: number };
  custoUsd: number;
  custoNaoMedido: string[];
};

function dataPorExtenso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Chicago", day: "numeric", month: "long", year: "numeric" });
}

/** `sameAs` só com QID que o resolvedor do projeto devolveu com confiança. */
async function comSameAs(entidades: EntidadeDaMateria[], contexto: string): Promise<EntidadeDaMateria[]> {
  const saida: EntidadeDaMateria[] = [];
  for (const e of entidades) {
    try {
      const r = await resolverEntidadeNoWikidata(e.nome, { paisDaPauta: "EUA", contexto });
      const qid = r.entidade?.qid;
      saida.push(qid && (r.entidade?.confianca ?? 0) >= 70 && !r.ambigua ? { ...e, sameAs: `https://www.wikidata.org/wiki/${qid}` } : e);
    } catch {
      saida.push(e);
    }
  }
  return saida;
}

function contarLinks(html: string): Resultado["contagem"] {
  const semServico = html.replace(/<section class="(?:leia-tambem|fontes)">[\s\S]*?<\/section>/g, "");
  const leia = html.match(/<section class="leia-tambem">[\s\S]*?<\/section>/)?.[0] ?? "";
  const fontes = html.match(/<section class="fontes">[\s\S]*?<\/section>/)?.[0] ?? "";
  const corpoDeTexto = semServico
    .replace(/<section class="perguntas">[\s\S]*?<\/section>/g, "")
    .replace(/<p class="legenda-da-capa">[\s\S]*?<\/p>/g, "");
  return {
    palavras: palavrasDoHtml(html.replace(/<p class="legenda-da-capa">[\s\S]*?<\/p>/g, "")),
    palavrasDoTexto: palavrasDoHtml(corpoDeTexto),
    linksNoTexto: (semServico.match(/<a\b/g) ?? []).length,
    linksInternos: (leia.match(/<a\b/g) ?? []).length,
    linksDeFonte: (fontes.match(/<a\b/g) ?? []).length,
  };
}

async function reescrever(a: LinhaDoArtigo, opcoes: { trocarTitulo: boolean; umaFonte: boolean }): Promise<Resultado | null> {
  const client = clienteDoBanco();
  const livro = criarLivroDeCustos();
  const url = (a.source_urls ?? [])[0];
  if (!url) throw new Error(`${a.slug} não tem source_urls gravado.`);

  // 1. A fonte, de novo.
  const notas: string[] = [];
  const fonte = await buscarTextoDaFonte(url, fetch, notas);
  console.log(`\n== Fonte\n${url}\n${notas.map((n) => `   ${n}`).join("\n")}`);
  if (!fonte) {
    console.log("A fonte não foi alcançada. Nada é escrito: silêncio é resultado válido.");
    return null;
  }

  // 2. O pacote factual.
  const p = await montarPacoteFactual({ titulo: fonte.metadados.titulo || a.title, texto: fonte.texto, urls: [url] });
  livro.lancar("pacote_factual", "comum", p.custoUsd, p.tokens);
  let pacote = p.pacote;

  // 2b. As outras fontes do mesmo fato (06/10/2026), as mesmas réguas do ramo do portal.
  if (!opcoes.umaFonte) {
    const { data: cand } = await client
      .from("news_candidates")
      .select("embedding")
      .eq("project_id", a.project_id)
      .or(`url.eq.${url},canonical_url.eq.${url}`)
      .limit(1)
      .maybeSingle();
    const bruto = (cand as { embedding?: unknown } | null)?.embedding;
    const vetor = Array.isArray(bruto) ? (bruto as number[]) : typeof bruto === "string" && bruto.startsWith("[") ? (JSON.parse(bruto) as number[]) : null;
    const quando = new Date(a.published_at ?? Date.now());
    const r = await reunirFontesDaMateria({
      principal: { url, titulo: fonte.metadados.titulo || a.title, nome: fonte.metadados.veiculo || url, vetor, pacote },
      candidatas: vetor ? await candidatasComVetor(client, a.project_id, new Date(quando.getTime() - 3 * 86_400_000), new Date(quando.getTime() + 86_400_000)) : [],
      linksOficiais: fonte.linksOficiais ?? [],
      livro,
    });
    console.log(`\n== Fontes do mesmo fato\n${r.linhasDeLog.map((l) => `   ${l}`).join("\n")}`);
    pacote = r.pacote;
  }

  // 3. A matéria, com a instrução do projeto valendo (a versão editável, se a capacidade estiver ligada).
  const projeto = await getProjectById(a.project_id);
  if (!projeto) throw new Error(`projeto ${a.project_id} não encontrado`);
  const veiculo = (fonte.metadados.veiculo || "").replace(/\s+(Chicago|Local)$/i, "").trim() || "a fonte";
  const r = await comInstrucoesDoProjeto(
    projeto,
    async () => {
      const voz = (await vozesDosRamos(projeto.id)).artigo;
      return escreverArtigoDaPauta(
        { classificacao: { pais: "EUA", eixo: a.category ?? "" }, grupo: { primary: { source_name: veiculo } } },
        pacote,
        { nome: projeto.brand.displayName || projeto.name, nicho: projeto.niche, briefing: projeto.editorialPromptExtra ?? "", voz },
        {
          livro,
          instrucaoExtra: `TÍTULO ATUAL DA MATÉRIA: ${a.title}\nMantenha este título em "titulo", a menos que o pacote sustente um claramente melhor pelo modelo de título.`,
        },
      );
    },
    { cliente: () => client },
  );

  console.log(`\n== Auditor\n   ${r.veredicto.aprovado ? "APROVADA" : "BLOQUEADA"} em ${r.tentativas} tentativa(s)`);
  for (const b of r.veredicto.bloqueios) console.log(`   bloqueio: ${b}`);
  for (const av of r.veredicto.avisos) console.log(`   aviso: ${av}`);
  if (!r.artigo || !r.veredicto.aprovado) {
    console.log("A matéria não passou. Nada é gravado.");
    return null;
  }
  const artigo = r.artigo;

  // 4. Título: o atual fica, salvo pedido.
  const tituloFinal = opcoes.trocarTitulo ? artigo.titulo : a.title;
  if (artigo.titulo !== a.title) console.log(`   título proposto pelo redator: "${artigo.titulo}"${opcoes.trocarTitulo ? " (ACEITO)" : " (mantido o atual)"}`);
  const artigoFinal: Artigo = { ...artigo, titulo: tituloFinal };

  // 5. Links internos, fontes e editoria.
  const categoria = a.category ?? "";
  const editoria = editoriaPeloNome(categoria);
  const relacionadas = await buscarRelacionadas(client, a.project_id, {
    slug: a.slug,
    categoria,
    texto: [tituloFinal, ...(artigo.assuntos ?? [])].join(" "),
  });
  const detalhe = [
    fonte.metadados.titulo ? `"${fonte.metadados.titulo}"` : "",
    fonte.metadados.autores.length ? `por ${fonte.metadados.autores.join(", ")}` : "",
    fonte.metadados.publicadaEm ? dataPorExtenso(fonte.metadados.publicadaEm) : "",
  ]
    .filter(Boolean)
    .join(", ");
  const fontes = [
    { nome: fonte.metadados.veiculo || veiculo, url, detalhe },
    ...(pacote.fontes ?? []).filter((f) => !f.principal).map((f) => ({ nome: f.nome, url: f.url })),
  ];
  const fontesDoTexto = pacote.fontes?.length ? pacote.fontes.map((f) => ({ id: f.id, nome: f.id === "F1" ? fonte.metadados.veiculo || veiculo : f.nome, url: f.url })) : undefined;

  // 6. A foto da capa, descrita pela conferência visual e conferida contra o pacote.
  const custoNaoMedido: string[] = [];
  let legenda = "";
  if (a.cover_image) {
    const imagem = a.cover_image.replace(/&amp;/g, "&");
    const v = await conferirImagem(
      { imageUrl: imagem, sourceAssetId: "", imageContextType: "conceptual" },
      // Sem a manchete de propósito: com ela, o modelo "vê" Chicago numa foto
      // de prédios qualquer (medido no ensaio). A legenda diz o que a foto
      // mostra, e não o que a matéria gostaria que ela mostrasse.
      { titulo: "Descreva apenas o que a foto mostra, sem supor lugar, pessoa ou data que ela não deixe evidente." },
    );
    custoNaoMedido.push("conferência visual da capa (a função não devolve o uso de tokens)");
    const segura = v.falhou ? null : legendaDaFoto(v.descricao, pacote);
    console.log(`\n== Capa\n   descrição do modelo: ${v.falhou ? `(falhou: ${v.motivo})` : v.descricao}\n   usada: ${segura ?? "(recusada pela ancoragem, vai a legenda neutra)"}`);
    legenda = segura ?? legendaNeutra((artigo.assuntos ?? [])[0]);
  }
  let creditoAntigo = (a.content_html ?? "").match(/<p[^>]*class="credito-da-foto"[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? "";
  // Sem crédito gravado, o da origem (06/10/2026); pela metade não grava, e a página segue perguntando.
  if (!creditoAntigo && a.cover_image) {
    const c = await resolverCreditoDaCapa(enderecoLimpoDaImagem(a.cover_image));
    if (c && creditoCompleto(c)) creditoAntigo = htmlDoCredito(c);
  }

  const corpo = renderizarArtigoHtml(artigoFinal, { nome: veiculo, url }, {
    fontes,
    ...(fontesDoTexto ? { fontesDoTexto } : {}),
    relacionadas,
    ...(editoria ? { editoria: { nome: editoria.nome, href: hrefDaEditoria(editoria.id) } } : {}),
  });
  const html = `${legenda ? htmlDaLegenda(legenda) : ""}${creditoAntigo}${corpo}`;

  // 7. Descrição de busca: a do redator, se couber; senão a régua da correção.
  let descricao = semMarcadorDeLink(artigo.descricao_seo).trim();
  if (descricao.length < DESCRICAO_MINIMA || descricao.length > DESCRICAO_MAXIMA) {
    const { data } = await client.from("articles").select("slug, seo_description").eq("status", "published").neq("slug", a.slug);
    const usadas = new Set(((data ?? []) as Array<{ seo_description: string | null }>).map((x) => normalizarDescricao(x.seo_description)).filter(Boolean));
    descricao = descricaoPorRegra(tituloFinal, corpo, usadas).valor ?? descricao;
  }

  // 8. Assuntos e entidades: só entidade que o texto final nomeia, e assunto
  // pelo validador (entidade ou tema da lista fechada de `temas.ts`).
  const ix = indexacaoDoArtigoEscrito(artigoFinal, pacote, { excluir: [...fonte.metadados.autores, fonte.metadados.veiculo, veiculo], editoria: categoria });
  for (const linha of descreverDescartes(ix.descartados)) console.log(`   ${linha}`);
  if (ix.abaixoDoMinimo) console.log(`   ASSUNTOS ABAIXO DO MÍNIMO: ${ix.assuntos.length}, o texto não sustenta mais`);
  const entidades = await comSameAs(ix.entidades, `${tituloFinal} ${(artigo.abertura ?? []).join(" ")}`);
  const tags = [...tagsSemIndexacao(a.tags), ...tagsDeIndexacao({ assuntos: ix.assuntos, entidades })];

  const contagem = contarLinks(html);
  const patch: Record<string, unknown> = {
    title: tituloFinal,
    excerpt: descricao,
    description: semMarcadorDeLink(artigo.subtitulo || descricao),
    content_html: html,
    content: secoesParaConteudo(artigoFinal),
    seo_title: tituloDeBuscaPorRegra(tituloFinal).valor,
    seo_description: descricao,
    aeo_questions: artigo.perguntas.map((q) => ({ pergunta: semMarcadorDeLink(q.pergunta), resposta: semMarcadorDeLink(q.resposta) })),
    tags,
    reading_minutes: Math.max(1, Math.round(contagem.palavras / 200)),
    updated_at: new Date().toISOString(),
  };

  return {
    slug: a.slug,
    fonte: { url, via: fonte.via, urlLida: fonte.urlLida, notas },
    pacote,
    artigo: artigoFinal,
    tituloFinal,
    removidas: (r.removidas ?? []).map((x) => ({ id: x.id, motivo: x.motivo, texto: x.texto })),
    avisos: r.veredicto.avisos,
    patch,
    contagem,
    custoUsd: livro.lancamentos().reduce((s, l) => s + l.custoUsd, 0),
    custoNaoMedido,
  };
}

/** A matéria como texto, na ordem da página, para ler no terminal. */
function textoParaLer(r: Resultado): string {
  const a = r.artigo;
  const linhas: string[] = [`# ${r.tituloFinal}`, "", `_${semMarcadorDeLink(a.subtitulo)}_`, ""];
  if ((a.essencial ?? []).length) linhas.push("## O que você precisa saber", ...(a.essencial ?? []).map((t) => `- ${t}`), "");
  for (const p of a.abertura ?? []) linhas.push(p, "");
  for (const s of a.secoes) linhas.push(`## ${s.intertitulo}`, ...s.paragrafos.flatMap((p) => [p, ""]));
  if (a.tabela) linhas.push(`[tabela] ${a.tabela.titulo}`, a.tabela.colunas.join(" | "), ...a.tabela.linhas.map((l) => l.join(" | ")), "");
  if ((a.significado ?? []).length) linhas.push("## O que isso significa para quem olha para os EUA", ...(a.significado ?? []).flatMap((p) => [p, ""]));
  const html = String(r.patch.content_html);
  const leia = [...(html.match(/<section class="leia-tambem">[\s\S]*?<\/section>/)?.[0] ?? "").matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
  if (leia.length) linhas.push("## Leia também", ...leia.map((m) => `- ${m[2]} (${m[1]})`), "");
  if (a.perguntas.length) linhas.push("## Perguntas e respostas", ...a.perguntas.flatMap((q) => [`**${q.pergunta}**`, q.resposta, ""]));
  const fontes = [...(html.match(/<section class="fontes">[\s\S]*?<\/section>/)?.[0] ?? "").matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a>([^<]*)<\/li>/g)];
  if (fontes.length) linhas.push("## Fontes", ...fontes.map((m) => `- ${m[2]}${m[3]} (${m[1]})`), "");
  return linhas.join("\n");
}

function imprimir(r: Resultado): void {
  console.log(`\n== Matéria\n\n${textoParaLer(r)}`);
  console.log("\n== Assuntos e entidades (tags)");
  for (const t of r.patch.tags as string[]) console.log(`   ${t}`);
  console.log(`\n== Legenda da capa\n   ${String(r.patch.content_html).match(/<p class="legenda-da-capa">([\s\S]*?)<\/p>/)?.[1] ?? "(sem capa)"}`);
  if (r.removidas.length) {
    console.log("\n== Apagado pela poda");
    for (const x of r.removidas) console.log(`   ${x.id}: ${x.motivo}\n      "${x.texto.replace(/\s+/g, " ").slice(0, 300)}"`);
  }
  console.log("\n== Contagem");
  console.log(`   palavras na página (corpo inteiro)    ${r.contagem.palavras}`);
  console.log(`   palavras do texto (sem links e Q&A)  ${r.contagem.palavrasDoTexto}`);
  console.log(`   links no texto                       ${r.contagem.linksNoTexto}`);
  console.log(`   links internos (Leia também)         ${r.contagem.linksInternos}`);
  console.log(`   links de fonte                       ${r.contagem.linksDeFonte}`);
  console.log(`   perguntas                            ${(r.patch.aeo_questions as unknown[]).length}`);
  console.log(`   custo medido                         US$ ${r.custoUsd.toFixed(4)}`);
  for (const c of r.custoNaoMedido) console.log(`   não medido: ${c}`);
  console.log(`\n== Campos que mudam\n   ${Object.keys(r.patch).join(", ")}\n   (slug, cover_image e published_at ficam como estão)`);
}

/** `--so-ajustes`: as regras novas sobre a matéria gravada, sem modelo e sem reescrever frase. */
async function soAjustes(client: ReturnType<typeof clienteDoBanco>, a: LinhaDoArtigo, aplicar: boolean): Promise<void> {
  const r = ajustarMateriaGravada({ title: a.title, category: a.category, content_html: a.content_html ?? "", tags: a.tags });
  const lista = (xs: string[]) => (xs.length ? xs.map((x) => `   - ${x}`).join("\n") : "   (nenhum)");
  console.log(`\n== O que você precisa saber (corpo com ${r.essencial.palavrasDoCorpo} palavras)`);
  console.log(`ANTES\n${lista(r.essencial.antes)}\nDEPOIS\n${r.essencial.depois.length ? lista(r.essencial.depois) : "   (bloco removido)"}`);
  console.log(`\n== Assuntos\nANTES\n${lista(r.antes.assuntos)}\nDEPOIS\n${lista(r.depois.assuntos)}`);
  const ent = (es: EntidadeDaMateria[]) => es.map((e) => `${e.papel}:${e.tipo}:${e.nome}${e.sameAs ? ` (${e.sameAs})` : ""}`);
  console.log(`\n== Entidades (about e mentions)\nANTES\n${lista(ent(r.antes.entidades))}\nDEPOIS\n${lista(ent(r.depois.entidades))}`);
  console.log(`\n== Registro\n${lista(r.log)}`);
  console.log(`\n== Tags gravadas\n${lista(r.patch.tags)}`);
  const mudou = r.patch.content_html !== (a.content_html ?? "") || JSON.stringify(r.patch.tags) !== JSON.stringify(a.tags ?? []);
  if (!mudou) {
    console.log("\nNada muda: a matéria já segue as regras.");
    return;
  }
  if (!aplicar) {
    console.log("\nENSAIO: nada foi gravado. Rode com --aplicar para gravar content_html, tags e updated_at.");
    return;
  }
  const { error } = await client
    .from("articles")
    .update({ content_html: r.patch.content_html, tags: r.patch.tags, updated_at: new Date().toISOString() })
    .eq("id", a.id ?? "")
    .eq("slug", a.slug);
  if (error) throw new Error(`não gravou: ${error.message}`);
  console.log(`\nGravada: ${a.slug} (content_html, tags, updated_at).`);
  if (a.status === "published") {
    const aviso = await avisarBuscadores(client, a.project_id, [a.slug], "ajustes da matéria");
    console.log(`IndexNow: ${aviso.situacao}${aviso.detalhe ? ` (${aviso.detalhe})` : ""}`);
  }
}

async function main(): Promise<void> {
  carregarEnv();
  const so = argumento("--so");
  const aplicar = process.argv.includes("--aplicar");
  const de = argumento("--de");
  const saida = argumento("--saida");
  const trocarTitulo = process.argv.includes("--trocar-titulo");
  if (!so) throw new Error("Diga qual matéria: --so <slug>. Este script reescreve UMA matéria por vez.");

  const soAjuste = process.argv.includes("--so-ajustes");
  console.log(
    aplicar
      ? `MODO: APLICAR (grava no banco)${soAjuste ? ", só os ajustes, sem modelo" : ""}`
      : soAjuste
        ? "MODO: ENSAIO dos ajustes (sem modelo, sem custo; nada é gravado)"
        : "MODO: ENSAIO (o modelo é chamado e o custo é real; nada é gravado)",
  );
  const client = clienteDoBanco();
  const { data, error } = await client
    .from("articles")
    .select("id, slug, title, excerpt, description, seo_title, seo_description, category, cover_image, published_at, updated_at, content_html, content, aeo_questions, source_urls, status, project_id, tags")
    .eq("slug", so)
    .maybeSingle();
  if (error) throw new Error(`não consegui ler ${so}: ${error.message}`);
  if (!data) throw new Error(`nenhuma matéria com o slug ${so}`);
  const a = data as LinhaDoArtigo;

  if (process.argv.includes("--so-ajustes")) {
    await soAjustes(client, a, aplicar);
    return;
  }

  let r: Resultado | null;
  if (de) {
    r = JSON.parse(fs.readFileSync(de, "utf-8")) as Resultado;
    if (r.slug !== so) throw new Error(`${de} é da matéria ${r.slug}, não de ${so}.`);
    console.log(`Usando o resultado revisado em ${de}.`);
  } else {
    r = await reescrever(a, { trocarTitulo, umaFonte: process.argv.includes("--uma-fonte") });
  }
  if (!r) process.exit(2);
  imprimir(r);

  if (saida) {
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    fs.writeFileSync(saida, `${JSON.stringify(r, null, 2)}\n`);
    console.log(`\nResultado guardado em ${saida} (arquivo local; o banco não foi tocado).`);
  }

  if (!aplicar) return;
  const { error: erroDeGravacao } = await client.from("articles").update(r.patch).eq("id", a.id ?? "").eq("slug", so);
  if (erroDeGravacao) throw new Error(`não gravou: ${erroDeGravacao.message}`);
  console.log(`\nGravada: ${so}.`);
  if (a.status === "published") {
    const aviso = await avisarBuscadores(client, a.project_id, [so], "matéria reescrita");
    console.log(`IndexNow: ${aviso.situacao}${aviso.detalhe ? ` (${aviso.detalhe})` : ""}`);
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
