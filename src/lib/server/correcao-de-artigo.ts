import { z } from "zod";
import { editoriaDaPauta, editoriaPeloNome, nomeDaEditoria } from "@/lib/editorias";
import { callOpenAIJSON, calculateCost, getAIProviderConfig } from "./newsroom/ai-provider";
import { contencao } from "./newsroom/leitor";
import { validarAncoragem } from "./editorial/pacote-factual";
import {
  DESCRICAO_MAXIMA,
  DESCRICAO_MINIMA,
  LIMIAR_DE_REPETICAO,
  TITULO_SEO_MAXIMO,
  cobertura,
  corpoSemPerguntas,
  motivoDeRespostaSemLastro,
  normalizarDescricao,
  paisIdentificavel,
  pacoteDoCorpo,
  paragrafosDoCorpo,
  textoDeHtml,
} from "./auditoria-de-artigo";
import type { PerguntaVisivel } from "./dados-estruturados-do-artigo";

/**
 * A correção de uma matéria publicada, pelas réguas da auditoria (05/10/2026).
 *
 * Duas camadas, e a diferença entre elas é o ponto:
 *
 * - **Determinística**: título de busca, descrição e editoria saem do texto
 *   que já está publicado, por regra. Nada é escrito que não estivesse lá.
 * - **Uma chamada de modelo por matéria**, barata, que lê SÓ o corpo e propõe
 *   perguntas e respostas e intertítulos descritivos. Tudo que volta passa
 *   pela conferência de `auditoria-de-artigo.ts` (a ancoragem de número, data
 *   e nome de `pacote-factual.ts`, mais a cobertura de palavras): o que não
 *   se sustenta no corpo cai, sem reparo e sem segunda chamada.
 *
 * O texto dos parágrafos NUNCA é reescrito. O intertítulo é a única linha do
 * corpo que muda, e só quando o proposto passa na conferência; senão fica o
 * antigo.
 */

/** Frases inteiras, para nunca cortar no meio de um nome. */
function frasesDe(t: string): string[] {
  return t
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .split(/(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ"“0-9])/)
    .map((f) => f.trim())
    .filter(Boolean);
}

const RESSALVA = /,\s+(?:mas|e|enquanto|embora)\s+|\s+enquanto\s+|:\s+/i;
const PAIS_NO_FIM = /\s+(?:nos|dos|aos)\s+(?:EUA|Estados Unidos)\b/;

/**
 * O título de busca, por regra, a partir do título publicado.
 *
 * Até 60 caracteres, com o país identificável (regra 8 do modelo de título).
 * Se o título não cabe, tenta, nesta ordem, só o que não inventa palavra:
 * tirar "nos EUA" quando outra marca já situa (Hollywood, Wall Street, US$);
 * e ficar com a primeira metade, a do fato, quando a segunda é a ressalva
 * (regra 9: o fato vem primeiro). Nada disso coube: devolve o título inteiro e
 * diz que precisa de mão, porque cortar com reticências, que é o que o
 * desmonte fazia, deixa "busca sem mandado no Flock, em…" no resultado.
 */
export function tituloDeBuscaPorRegra(titulo: string): { valor: string; precisaDeMao: boolean } {
  const t = titulo.replace(/\s+/g, " ").trim();
  const cabe = (s: string) => s.length >= 20 && s.length <= TITULO_SEO_MAXIMO && paisIdentificavel(s);
  if (cabe(t)) return { valor: t, precisaDeMao: false };

  const semPais = t.replace(PAIS_NO_FIM, "").replace(/\s+/g, " ").trim();
  if (semPais !== t && cabe(semPais)) return { valor: semPais, precisaDeMao: false };

  const corte = t.search(RESSALVA);
  if (corte > 0) {
    const fato = t.slice(0, corte).replace(/[,;:\s]+$/, "");
    if (cabe(fato)) return { valor: fato, precisaDeMao: false };
    const fatoSemPais = fato.replace(PAIS_NO_FIM, "").trim();
    if (cabe(fatoSemPais)) return { valor: fatoSemPais, precisaDeMao: false };
  }
  return { valor: t, precisaDeMao: true };
}

/**
 * A descrição de busca, por regra: frases inteiras do corpo, em ordem, de 120
 * a 155 caracteres, sem repetir o título e sem repetir a descrição de outra
 * matéria. Começa pela abertura; se a primeira frase só repete o título, ela
 * é pulada. Sem combinação que caiba, fica a atual e a matéria vai para a mão.
 */
export function descricaoPorRegra(
  titulo: string,
  html: string,
  usadas: Set<string>,
): { valor: string | null; precisaDeMao: boolean } {
  const frases = paragrafosDoCorpo(html).flatMap(frasesDe);
  const serve = (d: string) =>
    d.length >= DESCRICAO_MINIMA &&
    d.length <= DESCRICAO_MAXIMA &&
    contencao(titulo, frasesDe(d)[0] ?? d) < LIMIAR_DE_REPETICAO &&
    !usadas.has(normalizarDescricao(d));
  for (let inicio = 0; inicio < Math.min(frases.length, 4); inicio++) {
    let d = "";
    for (let i = inicio; i < frases.length; i++) {
      d = d ? `${d} ${frases[i]}` : frases[i];
      if (d.length > DESCRICAO_MAXIMA) break;
      if (serve(d)) return { valor: d, precisaDeMao: false };
    }
  }
  return { valor: null, precisaDeMao: true };
}

/** A editoria do portal: a gravada, se é uma das seis; senão a inferida do rótulo e do título. */
export function editoriaPorRegra(categoria: string | null | undefined, titulo: string): string {
  if (editoriaPeloNome(categoria)) return editoriaPeloNome(categoria)!.nome;
  return nomeDaEditoria(editoriaDaPauta(categoria ?? "", titulo));
}

/* ---------------- a chamada de modelo ---------------- */

export const PropostaSchema = z.object({
  intertitulos: z
    .array(z.object({ secao: z.number().int().min(0), texto: z.string() }))
    .default([]),
  perguntas: z.array(z.object({ pergunta: z.string(), resposta: z.string() })).default([]),
});
export type Proposta = z.infer<typeof PropostaSchema>;

export type SecaoDoCorpo = { indice: number; intertitulo: string; texto: string };

/** As seções do corpo como o HTML as tem: `<section>` com `<h2>` opcional. */
export function secoesDoCorpo(html: string): SecaoDoCorpo[] {
  const limpo = corpoSemPerguntas(html);
  return [...limpo.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)].map((m, indice) => ({
    indice,
    intertitulo: textoDeHtml(m[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? ""),
    texto: textoDeHtml(m[1].replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/i, "")),
  }));
}

export function montarPedido(titulo: string, secoes: SecaoDoCorpo[]): Array<{ role: "system" | "user"; content: string }> {
  const system = `
Você lê UMA matéria jornalística em português e devolve dois complementos para ela. Você não escreve a matéria e não muda o texto dela.

REGRA DE FATO, acima de qualquer outra:
- Use SÓ o que está no texto abaixo. Nome, número, data, valor, cargo e causa que não estão no texto não existem.
- Número e valor saem escritos EXATAMENTE como no texto.
- Nunca diga o que as pessoas fazem, acompanham ou esperam. Nunca fale da reportagem ("o texto não informa").
- Sem travessão. Sem emoji.

1. "perguntas": de 3 a 5 perguntas que um leitor faria a um buscador sobre este assunto, cada uma com a resposta em uma ou duas frases curtas, tiradas do texto, de preferência com as palavras dele. Só pergunte o que o texto responde inteiro. Se o texto só responde duas, devolva duas.

2. "intertitulos": para cada seção numerada que TEM intertítulo, um intertítulo afirmativo e descritivo, de 3 a 9 palavras, que diga o que aquela seção conta, só com fatos DAQUELA seção. Não use rótulos como "Contexto", "Por que importa" ou "Na prática". Seção sem intertítulo (a abertura) não recebe.

Devolva EXCLUSIVAMENTE este JSON:
{"intertitulos":[{"secao":1,"texto":"..."}],"perguntas":[{"pergunta":"...?","resposta":"..."}]}
`.trim();
  const user = [
    `TÍTULO: ${titulo}`,
    "",
    ...secoes.map((s) => `[SEÇÃO ${s.indice}]${s.intertitulo ? ` intertítulo atual: ${s.intertitulo}` : " (abertura, sem intertítulo)"}\n${s.texto}`),
  ].join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Estimativa de custo antes de chamar: 4 caracteres por token, e uma resposta de 600 tokens. */
export function custoEstimado(modelo: string, pedido: Array<{ content: string }>): number {
  const entrada = Math.ceil(pedido.reduce((n, m) => n + m.content.length, 0) / 4);
  return calculateCost(modelo, entrada, 600);
}

export type Recusa = { o_que: string; motivo: string };

const GENERICOS = /^(contexto|por que importa|na pr[aá]tica|vis[aã]o geral|conclus[aã]o|resumo|introdu[cç][aã]o|saiba mais|entenda)$/i;

/**
 * Confere o que o modelo devolveu contra o corpo. Pergunta que não se
 * sustenta cai; intertítulo que não se sustenta na PRÓPRIA seção cai e o
 * antigo fica. Devolve o que passou e o que caiu, com o motivo.
 */
export function conferirProposta(
  proposta: Proposta,
  secoes: SecaoDoCorpo[],
): { perguntas: PerguntaVisivel[]; intertitulos: Map<number, string>; recusas: Recusa[] } {
  const corpo = secoes.map((s) => s.texto).join(" ");
  const recusas: Recusa[] = [];
  const perguntas: PerguntaVisivel[] = [];
  for (const p of proposta.perguntas) {
    const pergunta = p.pergunta.replace(/\s+/g, " ").trim();
    const resposta = p.resposta.replace(/\s+/g, " ").trim();
    let motivo: string | null = null;
    if (/[\u2014\u2013]/.test(pergunta + resposta)) motivo = "tem travessão";
    else if (!pergunta.endsWith("?")) motivo = "a pergunta não é pergunta";
    else if (resposta.length < 10 || resposta.length > 320) motivo = "resposta curta ou longa demais";
    else {
      const ancPergunta = validarAncoragem(pergunta, pacoteDoCorpo(corpo));
      const durosPergunta = ancPergunta.naoSustentadas.filter((c) => c.severidade === "bloqueio");
      motivo = durosPergunta.length
        ? `a pergunta afirma o que o corpo não tem: ${durosPergunta.map((c) => `"${c.valor}"`).join(", ")}`
        : motivoDeRespostaSemLastro(resposta, corpo);
    }
    if (motivo) recusas.push({ o_que: `pergunta "${pergunta}"`, motivo });
    else if (perguntas.length < 5) perguntas.push({ pergunta, resposta });
  }

  const intertitulos = new Map<number, string>();
  for (const it of proposta.intertitulos) {
    const secao = secoes.find((s) => s.indice === it.secao);
    const texto = it.texto.replace(/\s+/g, " ").replace(/[.;:]+$/, "").trim();
    let motivo: string | null = null;
    if (!secao || !secao.intertitulo) motivo = "seção sem intertítulo ou inexistente";
    else if (/[\u2014\u2013]/.test(texto)) motivo = "tem travessão";
    else if (GENERICOS.test(texto)) motivo = "rótulo de gaveta";
    else if (texto.split(" ").length < 3 || texto.split(" ").length > 10 || texto.length > 70) motivo = "fora de 3 a 9 palavras";
    else {
      const anc = validarAncoragem(texto, pacoteDoCorpo(secao.texto));
      const fora = anc.naoSustentadas.filter((c) => c.severidade === "bloqueio" || c.tipo === "nome");
      if (fora.length) motivo = `fora da seção: ${fora.map((c) => `"${c.valor}"`).join(", ")}`;
      else if (cobertura(texto, secao.texto) < 0.6) motivo = `só ${Math.round(cobertura(texto, secao.texto) * 100)}% das palavras estão na seção`;
    }
    if (motivo) recusas.push({ o_que: `intertítulo da seção ${it.secao} "${texto}"`, motivo });
    else if (secao) intertitulos.set(secao.indice, texto);
  }
  return { perguntas, intertitulos, recusas };
}

/** A chamada única, com o custo medido pela resposta. */
export async function proporComplementos(
  titulo: string,
  secoes: SecaoDoCorpo[],
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<{ proposta: Proposta; custoUsd: number; modelo: string }> {
  const env = opcoes.env ?? process.env;
  const modelo = getAIProviderConfig(env).triageModel;
  const { data, usage } = await callOpenAIJSON<unknown>(montarPedido(titulo, secoes), modelo, env, opcoes.fetcher ?? fetch);
  return { proposta: PropostaSchema.parse(data), custoUsd: usage.estimatedCostUsd, modelo };
}

/* ---------------- aplicar ao corpo ---------------- */

function escaparTexto(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Troca SÓ o texto do `<h2>` das seções indicadas. Parágrafo nenhum é tocado. */
export function trocarIntertitulos(html: string, novos: Map<number, string>): string {
  if (novos.size === 0) return html;
  let indice = -1;
  return html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/gi, (secao) => {
    if (/<h2[^>]*>\s*Perguntas e respostas\s*<\/h2>/i.test(secao)) return secao;
    indice += 1;
    const novo = novos.get(indice);
    if (!novo) return secao;
    return secao.replace(/(<h2\b[^>]*>)[\s\S]*?(<\/h2>)/i, `$1${escaparTexto(novo)}$2`);
  });
}

/** O `content` (seções em JSON) com os mesmos intertítulos trocados, na mesma ordem. */
export function trocarIntertitulosNoConteudo(
  conteudo: unknown,
  novos: Map<number, string>,
): Array<{ heading: string; paragraphs: string[] }> | unknown {
  if (!Array.isArray(conteudo) || novos.size === 0) return conteudo;
  return conteudo.map((s, i) => {
    const novo = novos.get(i);
    return novo && s && typeof s === "object" && (s as { heading?: string }).heading ? { ...(s as object), heading: novo } : s;
  });
}
