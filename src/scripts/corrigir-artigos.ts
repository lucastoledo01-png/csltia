import fs from "node:fs";
import path from "node:path";
import { identidadeDaImagem } from "../lib/imagem-da-capa";
import { fotosECreditosPorPauta, type HistoriaDaEdicao } from "../lib/server/artigos-por-pauta";
import {
  DESCRICAO_MAXIMA,
  DESCRICAO_MINIMA,
  LIMIAR_DE_REPETICAO,
  normalizarDescricao,
} from "../lib/server/auditoria-de-artigo";
import {
  conferirProposta,
  custoEstimado,
  descricaoPorRegra,
  editoriaPorRegra,
  montarPedido,
  proporComplementos,
  secoesDoCorpo,
  tituloDeBuscaPorRegra,
  trocarIntertitulos,
  trocarIntertitulosNoConteudo,
} from "../lib/server/correcao-de-artigo";
import { dataDeModificacao, perguntasDoArtigo } from "../lib/server/dados-estruturados-do-artigo";
import { escapeHtml } from "../lib/server/html";
import { contencao } from "../lib/server/newsroom/leitor";
import { getAIProviderConfig } from "../lib/server/newsroom/ai-provider";
import { argumento, carregarEnv, clienteDoBanco, lerEnsaioDoDesmonte, lerPublicadas, type LinhaDoArtigo } from "./artigos-comum";

/**
 * A correção das matérias publicadas pelas réguas da auditoria (05/10/2026).
 *
 * FEITO PARA RODAR DEPOIS QUE O DONO APROVAR A MATÉRIA-MODELO
 * (`docs/design/artigo-modelo-2026-10-05/`). O piloto é uma matéria só, com
 * tudo aplicado; o lote inteiro vem depois.
 *
 * Ensaio por padrão: lê o banco, monta a correção e imprime, matéria por
 * matéria, o que mudaria (antes -> depois) e o custo estimado. Nada é gravado.
 *
 *   npx tsx src/scripts/corrigir-artigos.ts                          ensaio, sem chamar modelo
 *   npx tsx src/scripts/corrigir-artigos.ts --com-modelo             ensaio chamando o modelo (gasta, não grava)
 *   npx tsx src/scripts/corrigir-artigos.ts --so <slug>              uma matéria só
 *   npx tsx src/scripts/corrigir-artigos.ts --sobre-o-ensaio         sobre as matérias que o desmonte GRAVARIA
 *   npx tsx src/scripts/corrigir-artigos.ts --saida-json <arquivo>   grava as matérias corrigidas num JSON local
 *   npx tsx src/scripts/corrigir-artigos.ts --aplicar                grava no banco (chama o modelo)
 *
 * O que muda, e o que nunca muda:
 *
 *   - título de busca, descrição e editoria, por regra (`correcao-de-artigo.ts`);
 *   - perguntas e respostas, UMA chamada barata por matéria que lê só o corpo,
 *     e cada resposta conferida contra o corpo; a que não se sustenta cai.
 *     Matéria que já tem perguntas gravadas não é tocada nesse campo;
 *   - intertítulo rótulo ("Contexto") trocado pelo descritivo que a mesma
 *     chamada propõe, só se ele se sustentar na própria seção;
 *   - o crédito da foto da capa, recuperado do HTML da edição de origem, que o
 *     desmonte não levou (a licença CC BY exige crédito visível);
 *   - `updated_at`: agora, quando o que o leitor vê mudou (perguntas,
 *     intertítulo, crédito); o da publicação, quando nada visível mudou e a
 *     data só vinha da gravação do desmonte. É de onde sai o `dateModified`.
 *
 *   - O TEXTO DOS PARÁGRAFOS NUNCA É REESCRITO.
 *   - A CAPA NÃO É TROCADA. O dono decidiu manter as fotos por ora; a foto
 *     repetida fica só como métrica da auditoria.
 */

type Mudanca = { campo: string; antes: string; depois: string };

type Correcao = {
  artigo: LinhaDoArtigo;
  patch: Record<string, unknown>;
  mudancas: Mudanca[];
  aMao: string[];
  recusas: string[];
  custoUsd: number;
  custoEstimadoUsd: number;
};

function curto(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return (s ?? "").replace(/\s+/g, " ").slice(0, 400);
}

function descricaoServe(titulo: string, d: string | null | undefined, usadas: Set<string>): boolean {
  if (!d) return false;
  const primeira = d.split(/(?<=[.!?])\s+/)[0] ?? d;
  return (
    d.length >= DESCRICAO_MINIMA &&
    d.length <= DESCRICAO_MAXIMA &&
    !usadas.has(normalizarDescricao(d)) &&
    contencao(titulo, primeira) < LIMIAR_DE_REPETICAO
  );
}

/** O crédito da foto da capa, lido do HTML da edição de origem (a linha arquivada). */
async function creditoDaOrigem(
  a: LinhaDoArtigo,
  edicoes: Map<string, { content: unknown; content_html: string | null } | null>,
  ler: (slug: string) => Promise<{ content: unknown; content_html: string | null } | null>,
): Promise<string | null> {
  const origem = (a.tags ?? []).find((t) => t.startsWith("origem:edicao-"))?.slice("origem:".length);
  const capa = identidadeDaImagem(a.cover_image);
  if (!origem || !capa) return null;
  if (!edicoes.has(origem)) edicoes.set(origem, await ler(origem));
  const edicao = edicoes.get(origem);
  if (!edicao) return null;
  const historias = (Array.isArray(edicao.content) ? edicao.content : []) as HistoriaDaEdicao[];
  const titulos = historias.map((h) => (typeof h?.title === "string" ? h.title.trim() : ""));
  const i = titulos.indexOf(a.title.trim());
  if (i < 0) return null;
  const foto = fotosECreditosPorPauta(edicao.content_html, titulos)[i];
  return foto && identidadeDaImagem(foto.src) === capa ? foto.credito : null;
}

async function corrigir(
  a: LinhaDoArtigo,
  usadas: Set<string>,
  opcoes: {
    comModelo: boolean;
    modelo: string;
    credito: (a: LinhaDoArtigo) => Promise<string | null>;
    agora: string;
  },
): Promise<Correcao> {
  const patch: Record<string, unknown> = {};
  const mudancas: Mudanca[] = [];
  const aMao: string[] = [];
  const recusas: string[] = [];
  let html = a.content_html ?? "";
  let visivelMudou = false;
  let custoUsd = 0;

  const mudar = (campo: string, antes: unknown, depois: unknown) => {
    if (curto(antes) === curto(depois)) return;
    patch[campo] = depois;
    mudancas.push({ campo, antes: curto(antes), depois: curto(depois) });
  };

  // Título de busca.
  const titulo = tituloDeBuscaPorRegra(a.title);
  mudar("seo_title", a.seo_title ?? "", titulo.valor);
  if (titulo.precisaDeMao) aMao.push(`título de busca: "${a.title}" tem ${a.title.length} caracteres e nenhuma regra o encurta sem inventar`);

  // Descrição de busca.
  let descricao = a.seo_description ?? "";
  if (!descricaoServe(a.title, descricao, usadas)) {
    const nova = descricaoPorRegra(a.title, html, usadas);
    if (nova.valor) descricao = nova.valor;
    else aMao.push("descrição: nenhuma combinação de frases inteiras do corpo fecha 120 a 155 sem repetir título ou outra matéria");
  }
  mudar("seo_description", a.seo_description ?? "", descricao);
  usadas.add(normalizarDescricao(descricao));

  // Editoria.
  mudar("category", a.category ?? "", editoriaPorRegra(a.category, a.title));

  // Crédito da foto da capa.
  if (a.cover_image && !/class="credito-da-foto"/.test(html)) {
    const credito = await opcoes.credito(a);
    if (credito) {
      html = `<p class="credito-da-foto">${escapeHtml(credito)}</p>${html}`;
      visivelMudou = true;
      mudancas.push({ campo: "crédito da capa", antes: "(nenhum)", depois: credito });
    }
  }

  // Perguntas e intertítulos: uma chamada, conferida contra o corpo.
  const secoes = secoesDoCorpo(html);
  const pedido = montarPedido(a.title, secoes);
  const custoEstimadoUsd = custoEstimado(opcoes.modelo, pedido);
  const jaTemPerguntas = perguntasDoArtigo(a.aeo_questions).length > 0;
  const temRotulo = secoes.some((s) => s.intertitulo);
  if (opcoes.comModelo && (!jaTemPerguntas || temRotulo)) {
    try {
      const { proposta, custoUsd: custo } = await proporComplementos(a.title, secoes);
      custoUsd = custo;
      const conferida = conferirProposta(proposta, secoes);
      for (const r of conferida.recusas) recusas.push(`${r.o_que}: ${r.motivo}`);
      if (!jaTemPerguntas && conferida.perguntas.length > 0) {
        mudar("aeo_questions", a.aeo_questions ?? [], conferida.perguntas);
        visivelMudou = true;
      }
      if (!jaTemPerguntas && conferida.perguntas.length < 3) aMao.push(`perguntas: só ${conferida.perguntas.length} se sustentaram no corpo`);
      if (conferida.intertitulos.size > 0) {
        const antes = secoes.filter((s) => conferida.intertitulos.has(s.indice)).map((s) => s.intertitulo);
        html = trocarIntertitulos(html, conferida.intertitulos);
        patch.content = trocarIntertitulosNoConteudo(a.content, conferida.intertitulos);
        mudancas.push({
          campo: "intertítulos",
          antes: antes.join(" | "),
          depois: [...conferida.intertitulos.values()].join(" | "),
        });
        visivelMudou = true;
      }
    } catch (erro) {
      aMao.push(`chamada de modelo falhou: ${erro instanceof Error ? erro.message.slice(0, 200) : String(erro)}`);
    }
  }

  if (html !== (a.content_html ?? "")) patch.content_html = html;

  // A data de modificação.
  if (visivelMudou) {
    patch.updated_at = opcoes.agora;
  } else if (
    (a.tags ?? []).some((t) => t.startsWith("origem:edicao-")) &&
    a.published_at &&
    dataDeModificacao(a.published_at, a.updated_at) !== dataDeModificacao(a.published_at, a.published_at)
  ) {
    // Nada visível mudou e a data só vinha da gravação do desmonte.
    mudar("updated_at", a.updated_at ?? "", a.published_at);
  }
  if (patch.updated_at && !mudancas.some((m) => m.campo === "updated_at")) {
    mudancas.push({ campo: "updated_at", antes: curto(a.updated_at ?? ""), depois: String(patch.updated_at) });
  }

  return { artigo: a, patch, mudancas, aMao, recusas, custoUsd, custoEstimadoUsd };
}

async function main(): Promise<void> {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const sobreOEnsaio = process.argv.includes("--sobre-o-ensaio");
  const comModelo = aplicar || process.argv.includes("--com-modelo");
  const so = argumento("--so");
  const saidaJson = argumento("--saida-json");
  if (aplicar && sobreOEnsaio) throw new Error("--aplicar não vale com --sobre-o-ensaio: o ensaio não está no banco.");

  console.log("Correção de artigos. FEITA PARA RODAR DEPOIS QUE O DONO APROVAR A MATÉRIA-MODELO.");
  console.log(aplicar ? "MODO: APLICAR (grava no banco)" : `MODO: ENSAIO (nada é gravado${comModelo ? "; o modelo é chamado e o custo é real" : "; sem chamar o modelo"})`);

  const client = clienteDoBanco();
  const todas = sobreOEnsaio ? await lerEnsaioDoDesmonte(client) : (await lerPublicadas(client)).filter((a) => !a.slug.startsWith("edicao-"));
  const alvo = so ? todas.filter((a) => a.slug === so) : todas;
  if (so && alvo.length === 0) throw new Error(`nenhuma matéria com o slug ${so}`);

  const modelo = getAIProviderConfig(process.env).triageModel;
  const edicoes = new Map<string, { content: unknown; content_html: string | null } | null>();
  const lerEdicao = async (slug: string) => {
    const { data, error } = await client.from("articles").select("content, content_html").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`não consegui ler ${slug}: ${error.message}`);
    return (data as { content: unknown; content_html: string | null } | null) ?? null;
  };

  // As descrições das OUTRAS matérias, para nenhuma nova repetir uma existente.
  const usadas = new Set(todas.filter((a) => !alvo.includes(a)).map((a) => normalizarDescricao(a.seo_description)).filter(Boolean));
  const agora = new Date().toISOString();
  const correcoes: Correcao[] = [];
  for (const a of alvo) {
    correcoes.push(await corrigir(a, usadas, { comModelo, modelo, credito: (x) => creditoDaOrigem(x, edicoes, lerEdicao), agora }));
  }

  for (const c of correcoes) {
    console.log(`\n== ${c.artigo.slug}`);
    if (c.mudancas.length === 0) console.log("   nada muda");
    for (const m of c.mudancas) console.log(`   ${m.campo}\n      antes:  ${m.antes}\n      depois: ${m.depois}`);
    for (const r of c.recusas) console.log(`   recusado pela conferência: ${r}`);
    for (const p of c.aMao) console.log(`   À MÃO: ${p}`);
  }

  const contar = (campo: string) => correcoes.filter((c) => c.mudancas.some((m) => m.campo === campo)).length;
  const custoReal = correcoes.reduce((s, c) => s + c.custoUsd, 0);
  const custoPrevisto = correcoes.reduce((s, c) => s + c.custoEstimadoUsd, 0);
  console.log("\n== Resumo");
  console.log(`matérias lidas               ${correcoes.length}`);
  console.log(`com alguma mudança           ${correcoes.filter((c) => c.mudancas.length).length}`);
  for (const campo of ["seo_title", "seo_description", "category", "aeo_questions", "intertítulos", "crédito da capa", "updated_at"]) {
    console.log(`  ${campo.padEnd(26)} ${contar(campo)}`);
  }
  console.log(`precisam de mão              ${correcoes.filter((c) => c.aMao.length).length}`);
  console.log(`modelo                       ${modelo}, uma chamada por matéria`);
  console.log(`custo estimado               US$ ${custoPrevisto.toFixed(4)} (4 caracteres por token, 600 de resposta)`);
  if (comModelo) console.log(`custo medido                 US$ ${custoReal.toFixed(4)}`);

  if (saidaJson) {
    const corrigidas = correcoes.map((c) => ({ ...c.artigo, ...c.patch }));
    fs.mkdirSync(path.dirname(saidaJson), { recursive: true });
    fs.writeFileSync(saidaJson, `${JSON.stringify(so ? corrigidas[0] : corrigidas, null, 2)}\n`);
    console.log(`\nmatérias corrigidas em ${saidaJson} (arquivo local; o banco não foi tocado)`);
  }

  if (!aplicar) return;
  let gravadas = 0;
  for (const c of correcoes) {
    if (Object.keys(c.patch).length === 0 || !c.artigo.id) continue;
    const { error } = await client.from("articles").update(c.patch).eq("id", c.artigo.id);
    if (error) console.error(`  ERRO ${c.artigo.slug}: ${error.message}`);
    else gravadas++;
  }
  console.log(`\nGravadas ${gravadas} matéria(s).`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
