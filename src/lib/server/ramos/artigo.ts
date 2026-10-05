import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { limparVicios } from "../newsroom/anti-vicios";
import type { PautaAvaliada } from "../editorial/guarda";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { validarAncoragem } from "../editorial/pacote-factual";
import type { ClaimNaoSustentada } from "../editorial/pacote-factual";
import { auditarClaims } from "../editorial/claims-semanticas";
import type { ClaimSemantica } from "../editorial/claims-semanticas";
import { motivoDeRespostaSemLastro } from "../auditoria-de-artigo";
import { contencao } from "../newsroom/leitor";
import { regrarEssencial } from "./essencial";
import { escapeHtml, safeHttpUrl } from "../html";
import { editoriaDaPauta, nomeDaEditoria } from "@/lib/editorias";
import { temasParaOPrompt } from "@/lib/temas";
import { descreverDescartes, entidadesDoPacote, validarAssuntos, type AssuntoDescartado, type EntidadeDaMateria } from "@/lib/indexacao-do-artigo";
import type { LivroDeCustos } from "./custos";

/**
 * A matéria do portal, escrita para a busca (RF-13).
 *
 * Até 05/10/2026 o portal publicava o HTML do e-mail, sem chamada nova de
 * modelo: o artigo era a edição regravada. Isso fazia sentido com um canal só
 * e deixou de fazer quando o portal passou a ter a pauta como unidade. Uma
 * edição de quatro pautas sob o título "edicao-2026-10-05" não é encontrada
 * por quem procura nenhuma das quatro.
 *
 * Esta é a única matéria-prima: o pacote factual. O texto cru da fonte não
 * chega aqui (RF-05). E o auditor é próprio do ramo: ancoragem dura (nome,
 * número e data) mais a auditoria semântica de conclusões, as mesmas réguas
 * da newsletter aplicadas a UMA matéria, que sai sozinha se não passar.
 */

function aparar(limite: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string" || v.length <= limite) return v;
    const bruto = v.slice(0, limite);
    const ultimoEspaco = bruto.lastIndexOf(" ");
    return (ultimoEspaco > limite * 0.6 ? bruto.slice(0, ultimoEspaco) : bruto).trimEnd();
  }, z.string());
}

/**
 * O molde da matéria completa (06/10/2026), acertado com o dono depois de ele
 * achar a matéria-piloto de Chicago rala: 238 palavras e dois links, porque
 * ela tinha sido refeita só a partir do resumo da newsletter.
 *
 *   titulo, subtitulo       título no modelo de título e a linha fina
 *   essencial               "O que você precisa saber": até 3 tópicos, cada um
 *                           com fato próprio (regras em `essencial.ts`, 06/10)
 *   abertura                dois parágrafos com fato, quem, quando e onde, e o
 *                           link para a fonte dentro do texto, marcado [[assim]]
 *   secoes                  intertítulos em forma de pergunta do leitor
 *   tabela                  só quando há comparação de verdade
 *   significado             "O que isso significa para quem olha para os EUA",
 *                           só quando o pacote sustenta; vazio é o certo
 *   perguntas               3 a 5, cada resposta presente no corpo
 *   assuntos                até 5, entidade ou tema da lista fechada de
 *                           `temas.ts`; quem decide é `validarAssuntos`
 *
 * Os campos novos são OPCIONAIS no tipo, e não `.default()`: a armadilha
 * registrada em `decisoes.md` ("`.default()` em campo novo de schema
 * compartilhado") quebraria todo literal de `Artigo` que já existe, como o do
 * desmonte das edições. Ausente quer dizer vazio, em todo lugar que lê.
 */
const listaDeTexto = (maximo: number) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : v),
    z.array(z.string()).max(maximo),
  );

export const TabelaSchema = z.object({
  titulo: z.string().default(""),
  colunas: z.array(z.string()).min(2),
  linhas: z.array(z.array(z.string())).min(2),
});

export type Tabela = z.infer<typeof TabelaSchema>;

export const ArtigoSchema = z.object({
  /** O título da página. Diz o assunto com as palavras de quem busca. */
  titulo: z.string().min(10),
  subtitulo: aparar(220).pipe(z.string()).default(""),
  /** O título que vai para o resultado de busca. O Google corta perto de 60. */
  titulo_seo: aparar(70).pipe(z.string().min(10)),
  descricao_seo: aparar(160).pipe(z.string().min(20)),
  essencial: listaDeTexto(4).optional(),
  abertura: listaDeTexto(3).optional(),
  secoes: z
    .array(
      z.object({
        intertitulo: z.string().default(""),
        paragrafos: z.array(z.string().min(1)).min(1),
      }),
    )
    .max(6),
  /** Tabela malformada vira ausente, e não derruba a matéria. */
  tabela: z.preprocess((v) => (TabelaSchema.safeParse(v).success ? v : undefined), TabelaSchema.optional()),
  significado: listaDeTexto(3).optional(),
  /**
   * Perguntas e respostas para a busca por resposta (a coluna `aeo_questions`,
   * que era a única de SEO ainda vazia). Só entra pergunta cuja resposta está
   * no pacote, e por isso elas passam pelo mesmo auditor do corpo.
   */
  perguntas: z
    .array(z.object({ pergunta: z.string().min(5), resposta: z.string().min(5) }))
    .max(5)
    .default([]),
  /** O modelo propõe; `validarAssuntos` corta para cinco e decide o que fica. */
  assuntos: listaDeTexto(12).optional(),
});

export type Artigo = z.infer<typeof ArtigoSchema>;

export type MarcaDoArtigo = {
  nome: string;
  nicho: string;
  /** Briefing editorial do projeto. */
  briefing: string;
  /** A voz do ramo, de `vozes.ts`, já passada por `instrucaoDaEtapa`. */
  voz: string;
};

export function montarSystemDoArtigo(marca: MarcaDoArtigo): string {
  return `
Você escreve uma matéria para o portal da publicação "${marca.nome}".

NICHO:
${marca.nicho}

BRIEFING EDITORIAL DO PROJETO (vale sobre qualquer regra genérica abaixo):
${marca.briefing}

${marca.voz}

REGRA DE FATO, acima de qualquer outra:
- Você só pode afirmar o que está no PACOTE FACTUAL. Nome, número, data, valor, prazo, cargo, lei e órgão que não estão lá não existem.
- Consequência, causa, impacto, comparação, tendência e previsão também são fato: só entram se o pacote sustentar. Se o pacote não diz o que a medida provoca, escreva o que aconteceu e pare.
- "gaps" é a lista do que NÃO escrever. Não complete e não anuncie a lacuna.
- Nunca fale da reportagem: "a fonte não informa", "não foi detalhado" e parecidos estão proibidos. Texto mais curto é melhor que texto que confessa o que não tem.
- Nunca afirme o que as pessoas fazem, acompanham, observam ou esperam. Para falar com o leitor, fale com ele.
- Cada parágrafo, tópico e resposta é conferido sozinho contra o pacote. O que não se sustentar é APAGADO inteiro, sem aviso. Escreva cada um de forma que se sustente sozinho.

FORMA (o contrato do JSON):
- Sem travessão. Sem emoji. Sem saudação nem despedida.
- "subtitulo": a linha fina, uma frase que acrescenta ao título e não o repete.
- "descricao_seo": de 120 a 155 caracteres, frase inteira.
- "essencial": de dois a três tópicos curtos, uma frase cada. Cada tópico traz um fato que a abertura NÃO diz (número, data, prazo, próximo passo ou quem decide) e nunca repete uma frase dela. Tópico que repete a abertura ou não traz fato próprio é apagado; com menos de dois, o bloco sai. Em matéria de até 400 palavras, devolva lista vazia.
- "abertura": dois parágrafos. Marque UMA vez, no primeiro, o trecho que vira link para a fonte original, entre colchetes duplos: [[segundo a Axios]]. Só o nome do veículo ou a expressão que o cita.
- "secoes": de duas a quatro, cada uma com "intertitulo" em forma de pergunta (terminando em "?") e de um a três parágrafos.
- "tabela": só com comparação de verdade (dois ou mais itens medidos pela mesma régua, com os números do pacote). Sem isso, omita o campo.
- "significado": de zero a dois parágrafos, só quando o pacote diz o efeito. Lista vazia é o normal.
- "perguntas": de três a cinco, cada resposta autossuficiente e já dita no corpo da matéria. Menos que três é correto quando o pacote não rende.
- "assuntos": até cinco, e só de dois tipos: (1) nome próprio que está no pacote (pessoa, organização, lugar, programa), escrito como no pacote; (2) tema copiado EXATAMENTE da lista de temas abaixo. Palavra solta e genérica ("água", "energia", "governo", "economia") é descartada, e o que não está na lista também.

TEMAS PERMITIDOS EM "assuntos" (por editoria; use o nome exato):
${temasParaOPrompt()}

Devolva EXCLUSIVAMENTE este JSON:
{"titulo":"...","subtitulo":"...","titulo_seo":"...","descricao_seo":"...","essencial":["..."],"abertura":["...[[...]]...","..."],"secoes":[{"intertitulo":"...?","paragrafos":["..."]}],"tabela":{"titulo":"...","colunas":["...","..."],"linhas":[["...","..."]]},"significado":[],"perguntas":[{"pergunta":"...","resposta":"..."}],"assuntos":["..."]}
`.trim();
}

/**
 * O que o redator do artigo lê da pauta: país, editoria e nome da fonte.
 *
 * Estreito de propósito (05/10/2026): a refação da fila de aprovação reescreve
 * a matéria a partir do que ficou gravado na fila, e não da pauta avaliada
 * inteira, que não sobrevive ao ciclo. `PautaAvaliada` continua servindo.
 */
export type PautaDoArtigo = {
  classificacao: { pais: PautaAvaliada["classificacao"]["pais"] | string; eixo: PautaAvaliada["classificacao"]["eixo"] | string };
  grupo: { primary: { source_name: string } };
};

function montarUserDoArtigo(pauta: PautaDoArtigo, pacote: PacoteFactual): string {
  return [
    `PAÍS: ${pauta.classificacao.pais}`,
    `EDITORIA: ${pauta.classificacao.eixo}`,
    `FONTE: ${pauta.grupo.primary.source_name}`,
    "",
    "PACOTE FACTUAL (é tudo o que existe; nada fora daqui pode ser afirmado):",
    JSON.stringify(
      {
        verified_facts: pacote.verified_facts,
        people: pacote.people,
        organizations: pacote.organizations,
        places: pacote.places,
        dates: pacote.dates,
        numbers: pacote.numbers,
        gaps: pacote.gaps,
      },
      null,
      2,
    ),
  ].join("\n");
}

/** O texto sem o marcador do link da fonte, que não é palavra de ninguém. */
export function semMarcadorDeLink(t: string): string {
  return t.replace(/\[\[([^\]]+)\]\]/g, "$1");
}

/* ------------------------------------------------------------------ */
/* Unidades: o que é conferido, e apagado, sozinho                     */
/* ------------------------------------------------------------------ */

export type CampoDaUnidade =
  | "titulo"
  | "subtitulo"
  | "titulo_seo"
  | "descricao_seo"
  | "essencial"
  | "abertura"
  | "secao"
  | "tabela"
  | "significado"
  | "pergunta";

export type Unidade = {
  /** "abertura.0", "secao.1.2", "tabela.3", "pergunta.0" ... */
  id: string;
  campo: CampoDaUnidade;
  texto: string;
};

/** Acima disto, o parágrafo de "significado" só repete o corpo. */
export const LIMIAR_DE_RECAPITULACAO = 0.6;

/** Campos que, reprovados, não têm como sair sem levar a matéria junto. */
const CAMPOS_SEM_PODA: CampoDaUnidade[] = ["titulo", "titulo_seo"];

/**
 * A matéria em unidades conferíveis. Cada parágrafo, tópico, linha de tabela e
 * par de pergunta e resposta é uma unidade: é o que se apaga quando não se
 * sustenta, em vez de amaciar a frase.
 */
export function unidadesDoArtigo(a: Artigo): Unidade[] {
  const u: Unidade[] = [];
  const add = (id: string, campo: CampoDaUnidade, texto: string) => {
    const t = semMarcadorDeLink(texto ?? "").trim();
    if (t) u.push({ id, campo, texto: t });
  };
  add("titulo", "titulo", a.titulo);
  add("subtitulo", "subtitulo", a.subtitulo);
  add("titulo_seo", "titulo_seo", a.titulo_seo);
  add("descricao_seo", "descricao_seo", a.descricao_seo);
  (a.essencial ?? []).forEach((t, i) => add(`essencial.${i}`, "essencial", t));
  (a.abertura ?? []).forEach((t, i) => add(`abertura.${i}`, "abertura", t));
  a.secoes.forEach((s, i) => {
    add(`secao.${i}.h`, "secao", s.intertitulo);
    s.paragrafos.forEach((p, j) => add(`secao.${i}.${j}`, "secao", p));
  });
  if (a.tabela) {
    add("tabela.h", "tabela", [a.tabela.titulo, ...a.tabela.colunas].join(" | "));
    a.tabela.linhas.forEach((l, i) => add(`tabela.${i}`, "tabela", l.join(" | ")));
  }
  (a.significado ?? []).forEach((t, i) => add(`significado.${i}`, "significado", t));
  a.perguntas.forEach((p, i) => add(`pergunta.${i}`, "pergunta", `${p.pergunta}\n${p.resposta}`));
  return u;
}

/** Todo o texto que o leitor vê, para o auditor ler o mesmo que o leitor. */
export function textoDoArtigo(a: Artigo): string {
  return unidadesDoArtigo(a)
    .map((u) => u.texto)
    .join("\n");
}

export type IndexacaoDoArtigoEscrito = {
  assuntos: string[];
  entidades: EntidadeDaMateria[];
  descartados: AssuntoDescartado[];
};

/**
 * Assuntos e entidades de uma matéria escrita, decididos pelo CÓDIGO
 * (06/10/2026): as entidades do pacote que o texto final nomeia, e os assuntos
 * que o redator propôs passados por `validarAssuntos`, com os temas da lista
 * fechada que o texto trata. O redator, o ramo e o script de reescrita usam
 * esta função, e nenhum deles grava `artigo.assuntos` cru.
 */
export function indexacaoDoArtigoEscrito(
  artigo: Artigo,
  pacote: Pick<PacoteFactual, "people" | "organizations" | "places">,
  opcoes: { excluir?: string[]; editoria?: string | null } = {},
): IndexacaoDoArtigoEscrito {
  const texto = textoDoArtigo(artigo);
  const entidades = entidadesDoPacote(pacote, artigo.titulo, opcoes.excluir ?? [], texto);
  const { assuntos, descartados } = validarAssuntos(artigo.assuntos ?? [], { entidades, texto, editoria: opcoes.editoria ?? null });
  return { assuntos, entidades, descartados };
}

export type UnidadeReprovada = { id: string; campo: CampoDaUnidade; texto: string; motivo: string };

export type VeredictoDoArtigo = {
  aprovado: boolean;
  bloqueios: string[];
  avisos: string[];
  ancoragem: { conferidos: number; naoSustentadas: ClaimNaoSustentada[] };
  conclusoesSemLastro: ClaimSemantica[];
  /**
   * Onde cada reprovação caiu. A conclusão que não se acha em unidade nenhuma
   * não entra aqui e continua bloqueando a matéria inteira: sem saber onde
   * ela está, não há o que apagar.
   */
  unidadesReprovadas: UnidadeReprovada[];
};

function normalizarParaBusca(t: string): string {
  return semMarcadorDeLink(t)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .replace(/[^a-z0-9%$ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** As unidades que contêm o trecho apontado pelo auditor semântico. */
export function unidadesDoTrecho(trecho: string, unidades: Unidade[]): Unidade[] {
  const alvo = normalizarParaBusca(trecho);
  if (!alvo) return [];
  const diretas = unidades.filter((u) => normalizarParaBusca(u.texto).includes(alvo));
  if (diretas.length) return diretas;
  // O auditor às vezes cita a frase com uma vírgula ou um artigo diferente:
  // aceita a unidade que contém pelo menos 80% das palavras do trecho.
  const palavras = alvo.split(" ").filter((p) => p.length > 3);
  if (palavras.length < 3) return [];
  return unidades.filter((u) => {
    const texto = ` ${normalizarParaBusca(u.texto)} `;
    const dentro = palavras.filter((p) => texto.includes(` ${p} `)).length;
    return dentro / palavras.length >= 0.8;
  });
}

/**
 * O auditor do ramo. Determinístico primeiro, modelo depois, e cada
 * reprovação presa à unidade onde ela está.
 *
 * Auditoria semântica que NÃO RODOU vira aviso, não bloqueio: é a decisão de
 * 16/09/2026 para a newsletter, e vale aqui pelo mesmo motivo. Timeout do
 * fornecedor não é conclusão reprovada.
 */
export async function auditarArtigo(
  artigo: Artigo,
  pacote: PacoteFactual,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; livro?: LivroDeCustos } = {},
): Promise<VeredictoDoArtigo> {
  const unidades = unidadesDoArtigo(artigo);
  const texto = unidades.map((u) => u.texto).join("\n");
  const anc = validarAncoragem(texto, pacote);

  const claims = await auditarClaims(
    [{ indice: 0, titulo: artigo.titulo, texto, pacote }],
    opcoes.env ?? process.env,
    opcoes.fetcher ?? fetch,
  );
  opcoes.livro?.lancar("auditoria_claims", "artigo", claims.custoUsd, claims.tokens);

  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const reprovadas: UnidadeReprovada[] = [];

  // Ancoragem dura, unidade por unidade: o mesmo juiz, aplicado a cada pedaço.
  for (const u of unidades) {
    const r = validarAncoragem(u.texto, pacote);
    const duros = r.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    if (duros.length) {
      reprovadas.push({ ...u, motivo: `sem lastro: ${duros.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}` });
    }
  }

  if (!anc.ancorado) {
    const duros = anc.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    bloqueios.push(
      `REJECT_UNGROUNDED_CLAIM: ${duros.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}`,
    );
  }
  for (const c of anc.naoSustentadas.filter((x) => x.severidade === "aviso")) {
    avisos.push(`nome não conferido: "${c.valor}"`);
  }
  if (claims.naoSustentadas.length > 0) {
    bloqueios.push(
      `UNGROUNDED_EDITORIAL_CLAIM: ${claims.naoSustentadas.map((c) => `${c.tipo} "${c.trecho}"`).join(" | ")}`,
    );
    for (const c of claims.naoSustentadas) {
      for (const u of unidadesDoTrecho(c.trecho, unidades)) {
        reprovadas.push({ ...u, motivo: `${c.tipo} sem lastro: ${c.motivo || c.trecho}` });
      }
    }
  }
  if (claims.erro) avisos.push(`auditoria de conclusões não rodou: ${claims.erro}`);

  return {
    aprovado: bloqueios.length === 0,
    bloqueios,
    avisos,
    ancoragem: { conferidos: anc.conferidos, naoSustentadas: anc.naoSustentadas },
    conclusoesSemLastro: claims.naoSustentadas,
    unidadesReprovadas: reprovadas,
  };
}

/* ------------------------------------------------------------------ */
/* Poda: o que não se sustenta sai inteiro                             */
/* ------------------------------------------------------------------ */

export type ResultadoDaPoda = {
  artigo: Artigo;
  /** O que foi apagado, com o texto e o motivo, para o relatório. */
  removidas: UnidadeReprovada[];
  /** O que a poda não resolve. Vazio é matéria publicável. */
  bloqueios: string[];
};

function primeiraFraseQueCabe(t: string, limite: number): string {
  const limpo = semMarcadorDeLink(t).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  let saida = "";
  for (const frase of limpo.split(/(?<=[.!?])\s+/)) {
    const proxima = saida ? `${saida} ${frase}` : frase;
    if (proxima.length > limite) break;
    saida = proxima;
  }
  return saida;
}

/** O corpo da matéria em texto, sem as perguntas: o que sustenta as respostas. */
export function corpoEmTexto(a: Artigo): string {
  return [
    ...(a.essencial ?? []),
    ...(a.abertura ?? []),
    ...a.secoes.flatMap((s) => [s.intertitulo, ...s.paragrafos]),
    ...(a.tabela ? [a.tabela.titulo, a.tabela.colunas.join(" "), ...a.tabela.linhas.map((l) => l.join(" "))] : []),
    ...(a.significado ?? []),
  ]
    .map(semMarcadorDeLink)
    .join("\n");
}

/** Palavras do corpo que o leitor lê: abertura, seções, tabela e significado, sem o bloco de tópicos nem as perguntas. */
export function palavrasDoCorpo(a: Artigo): number {
  return corpoEmTexto({ ...a, essencial: [] })
    .replace(/\*/g, "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Apaga cada unidade reprovada, inteira. Nada é reescrito nem amaciado: o que
 * não se sustenta sai, e a matéria fica mais curta (decisão de 06/10/2026,
 * "parágrafo que falha é removido, não suavizado").
 *
 * Depois da poda, cada resposta das perguntas precisa estar no corpo que
 * SOBROU (`motivoDeRespostaSemLastro`, a mesma régua da correção de artigos):
 * apagar o parágrafo que sustentava uma resposta derruba a resposta junto.
 *
 * O que não se poda: título e título de busca reprovados, conclusão que o
 * auditor não conseguiu localizar, e matéria sem abertura nem parágrafo.
 */
export function podarArtigo(artigo: Artigo, veredicto: Pick<VeredictoDoArtigo, "unidadesReprovadas" | "conclusoesSemLastro" | "ancoragem">): ResultadoDaPoda {
  const fora = new Map<string, UnidadeReprovada>();
  for (const r of veredicto.unidadesReprovadas) if (!fora.has(r.id)) fora.set(r.id, r);
  const removidas: UnidadeReprovada[] = [...fora.values()];
  const bloqueios: string[] = [];

  for (const r of removidas) {
    if (CAMPOS_SEM_PODA.includes(r.campo)) bloqueios.push(`TITLE_UNGROUNDED: ${r.motivo}`);
  }

  // Conclusão semântica que não caiu em unidade nenhuma: não há o que apagar.
  const unidades = unidadesDoArtigo(artigo);
  for (const c of veredicto.conclusoesSemLastro) {
    if (unidadesDoTrecho(c.trecho, unidades).length === 0) {
      bloqueios.push(`UNGROUNDED_EDITORIAL_CLAIM sem lugar na matéria: ${c.tipo} "${c.trecho}"`);
    }
  }
  // Número ou data duros que a conferência por unidade não achou (só aparecem
  // quando a frase atravessa duas unidades): idem.
  const textoDasUnidades = new Set(removidas.map((r) => r.id));
  if (textoDasUnidades.size === 0 && veredicto.ancoragem.naoSustentadas.some((c) => c.severidade === "bloqueio")) {
    bloqueios.push("REJECT_UNGROUNDED_CLAIM sem lugar na matéria");
  }

  const sai = (id: string) => fora.has(id);
  const podado: Artigo = {
    ...artigo,
    subtitulo: sai("subtitulo") ? "" : artigo.subtitulo,
    essencial: (artigo.essencial ?? []).filter((_, i) => !sai(`essencial.${i}`)),
    abertura: (artigo.abertura ?? []).filter((_, i) => !sai(`abertura.${i}`)),
    secoes: artigo.secoes
      .map((s, i) => ({
        // Pergunta de intertítulo reprovada leva a seção: resposta sem a
        // pergunta é parágrafo solto sob o intertítulo errado. E o mesmo vale
        // ao contrário: a resposta é o PRIMEIRO parágrafo (a voz pede isso), e
        // sem ele o que sobra fica embaixo de uma pergunta que não responde.
        // Medido no ensaio de Chicago: apagado o parágrafo da câmara municipal,
        // o do governador ficou sob "O que acontece agora?".
        intertitulo: s.intertitulo,
        paragrafos:
          sai(`secao.${i}.h`) || (s.intertitulo.trim() && sai(`secao.${i}.0`))
            ? []
            : s.paragrafos.filter((_, j) => !sai(`secao.${i}.${j}`)),
      }))
      .filter((s) => s.paragrafos.length > 0),
    tabela: (() => {
      if (!artigo.tabela || sai("tabela.h")) return undefined;
      const linhas = artigo.tabela.linhas.filter((_, i) => !sai(`tabela.${i}`));
      return linhas.length >= 2 ? { ...artigo.tabela, linhas } : undefined;
    })(),
    significado: (artigo.significado ?? []).filter((_, i) => !sai(`significado.${i}`)),
    perguntas: artigo.perguntas.filter((_, i) => !sai(`pergunta.${i}`)),
  };

  /*
   * O bloco "O que isso significa..." só fica se ACRESCENTA. Parágrafo cujas
   * palavras já estão quase todas no resto do corpo é recapitulação com
   * título de análise, e o dono pediu o bloco só quando a fonte sustenta um
   * sentido próprio. Medido no ensaio de Chicago: o redator preencheu o bloco
   * repetindo a abertura. É a régua "cada linha acrescenta" de `decisoes.md`,
   * com a mesma medida de contenção do leitor.
   */
  const semSignificado = corpoEmTexto({ ...podado, significado: [] });
  podado.significado = (podado.significado ?? []).filter((p, i) => {
    const c = contencao(semMarcadorDeLink(p), semSignificado);
    if (c >= LIMIAR_DE_RECAPITULACAO) {
      removidas.push({ id: `significado.${i}`, campo: "significado", texto: p, motivo: `repete o corpo (${Math.round(c * 100)}% das palavras já estão nele)` });
      return false;
    }
    return true;
  });

  /*
   * "O que você precisa saber" com as regras do dono (06/10/2026): até três
   * tópicos, nenhum repetindo a abertura, cada um com fato próprio, e o bloco
   * só em corpo acima de 400 palavras. Antes das respostas, porque o corpo
   * que as sustenta inclui o bloco.
   */
  const essencial = regrarEssencial(podado.essencial ?? [], podado.abertura ?? [], palavrasDoCorpo(podado));
  podado.essencial = essencial.mantidos;
  for (const r of essencial.removidos) {
    removidas.push({ id: `essencial.${r.indice}`, campo: "essencial", texto: r.texto, motivo: r.motivo });
  }

  // As respostas contra o corpo que sobrou.
  const corpo = corpoEmTexto(podado);
  podado.perguntas = podado.perguntas.filter((p, i) => {
    const motivo = motivoDeRespostaSemLastro(p.resposta.replace(/\*/g, ""), corpo);
    if (motivo) removidas.push({ id: `pergunta.${i}`, campo: "pergunta", texto: `${p.pergunta}\n${p.resposta}`, motivo: `resposta fora do corpo: ${motivo}` });
    return !motivo;
  });

  // Descrição de busca reprovada: volta como a primeira frase da abertura que
  // sobrou, que já passou pela mesma conferência.
  if (sai("descricao_seo")) {
    const base = (podado.abertura ?? [])[0] ?? podado.secoes[0]?.paragrafos[0] ?? "";
    podado.descricao_seo = primeiraFraseQueCabe(base, 155) || podado.titulo;
  }

  const temCorpo = (podado.abertura ?? []).length > 0 || podado.secoes.some((s) => s.paragrafos.length > 0);
  if (!temCorpo) bloqueios.push("ARTICLE_EMPTY_AFTER_PRUNE: nenhum parágrafo se sustentou");

  return { artigo: podado, removidas, bloqueios };
}

export type ResultadoDoArtigo = {
  artigo: Artigo | null;
  veredicto: VeredictoDoArtigo;
  tentativas: number;
  erro: string | null;
  /** O que a poda apagou depois do reparo, com o motivo. */
  removidas?: UnidadeReprovada[];
};

/**
 * Escreve, audita, tenta UM reparo e poda.
 *
 * Um reparo, e não dois como a newsletter: aqui a peça é uma matéria só. O que
 * sobra depois dele é apagado unidade por unidade, e só não sai a matéria
 * quando a poda não resolve (título sem lastro, conclusão sem lugar, nada que
 * se sustente).
 */
export async function escreverArtigoDaPauta(
  pauta: PautaDoArtigo,
  pacote: PacoteFactual,
  marca: MarcaDoArtigo,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; livro?: LivroDeCustos; instrucaoExtra?: string } = {},
): Promise<ResultadoDoArtigo> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const system = montarSystemDoArtigo(marca);
  const user = [montarUserDoArtigo(pauta, pacote), opcoes.instrucaoExtra ?? ""].filter(Boolean).join("\n\n");

  const escrever = async (instrucaoExtra: string): Promise<Artigo> => {
    const { data, usage } = await callOpenAIJSON<unknown>(
      [
        { role: "system", content: system },
        { role: "user", content: instrucaoExtra ? `${user}\n\n${instrucaoExtra}` : user },
      ],
      config.editorModel,
      env,
      fetcher,
    );
    opcoes.livro?.lancar(instrucaoExtra ? "reparo" : "redacao", "artigo", usage.estimatedCostUsd, usage.totalTokens);
    return ArtigoSchema.parse(limparVicios(data));
  };

  let artigo: Artigo;
  try {
    artigo = await escrever("");
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return {
      artigo: null,
      veredicto: {
        aprovado: false,
        bloqueios: [`ARTICLE_WRITE_FAILED: ${motivo}`],
        avisos: [],
        ancoragem: { conferidos: 0, naoSustentadas: [] },
        conclusoesSemLastro: [],
        unidadesReprovadas: [],
      },
      tentativas: 1,
      erro: motivo,
    };
  }

  let veredicto = await auditarArtigo(artigo, pacote, opcoes);
  let tentativas = 1;

  if (!veredicto.aprovado) {
    tentativas += 1;
    const reparo = `
A matéria abaixo foi reprovada na conferência de fatos. Reescreva SOMENTE o necessário e devolva o JSON inteiro.

APONTAMENTOS:
${veredicto.bloqueios.map((b) => `- ${b}`).join("\n")}

COMO CORRIGIR: remova a afirmação ou troque pelo que o pacote diz. Nome, número ou data fora do pacote saem, sem substituto. Se faltar informação depois disso, a matéria fica mais curta, e está certo.

MATÉRIA ATUAL:
${JSON.stringify(artigo, null, 2)}
`.trim();
    try {
      artigo = await escrever(reparo);
      veredicto = await auditarArtigo(artigo, pacote, opcoes);
    } catch (erro) {
      // O reparo falhou tecnicamente. O veredito de antes continua valendo, e
      // a poda trabalha sobre a primeira versão.
      veredicto = {
        ...veredicto,
        avisos: [...veredicto.avisos, `reparo não rodou: ${erro instanceof Error ? erro.message : String(erro)}`],
      };
    }
  }

  // A poda roda sempre: além do que o auditor reprovou, ela confere cada
  // resposta contra o corpo e tira o bloco de significado que só repete.
  const poda = podarArtigo(artigo, veredicto);
  if (poda.bloqueios.length > 0) {
    return {
      artigo,
      veredicto: { ...veredicto, bloqueios: [...veredicto.bloqueios, ...poda.bloqueios] },
      tentativas,
      erro: null,
      removidas: poda.removidas,
    };
  }
  // Os assuntos que o redator propôs passam pelo validador antes de sair daqui.
  const indexacao = indexacaoDoArtigoEscrito(poda.artigo, pacote);
  return {
    artigo: { ...poda.artigo, assuntos: indexacao.assuntos },
    veredicto: {
      ...veredicto,
      aprovado: true,
      bloqueios: [],
      avisos: [...veredicto.avisos, ...poda.removidas.map((r) => `APAGADO ${r.id}: ${r.motivo}`), ...descreverDescartes(indexacao.descartados)],
    },
    tentativas,
    erro: null,
    removidas: poda.removidas,
  };
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

/** Negrito do redator vira <strong>, e só depois de o texto estar escapado. */
function paragrafoHtml(texto: string): string {
  return escapeHtml(semMarcadorDeLink(texto)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*/g, "");
}

/**
 * O parágrafo da abertura com o link para a fonte DENTRO do texto.
 *
 * O redator marca o trecho com [[colchetes duplos]]. Sem marca (ou com a marca
 * apagada pela poda junto do parágrafo), o link vai na primeira menção ao nome
 * do veículo. Sem menção, o parágrafo sai sem link, e a fonte continua na
 * seção "Fontes": inventar uma frase para pendurar o link seria texto sem
 * lastro.
 */
export function aberturaComLink(paragrafos: string[], fonte: { nome: string; url: string }): string[] {
  const url = safeHttpUrl(fonte.url, "");
  const ancora = (t: string) => `<a href="${url}" rel="noopener" target="_blank">${t}</a>`;
  let feito = false;
  const marcados = paragrafos.map((p) => {
    let html = escapeHtml(p).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\[\[([^\]]+)\]\]/g, (_m, dentro: string) => {
      if (feito || !url) return dentro;
      feito = true;
      return ancora(dentro);
    });
    return html.replace(/\*/g, "");
  });
  if (!feito && url && fonte.nome.trim()) {
    const nome = escapeHtml(fonte.nome.trim());
    const i = marcados.findIndex((h) => h.includes(nome));
    if (i >= 0) {
      marcados[i] = marcados[i].replace(nome, ancora(nome));
      feito = true;
    }
  }
  return marcados;
}

export type MateriaRelacionada = { slug: string; titulo: string };

export type ExtrasDoHtml = {
  /** "Leia também": matérias publicadas da mesma editoria. */
  relacionadas?: MateriaRelacionada[];
  /** A página da editoria, para o fim do "Leia também". */
  editoria?: { nome: string; href: string };
  /**
   * Todas as fontes usadas. Presente: vira a seção "Fontes", em lista.
   * Ausente: o crédito antigo, um parágrafo `.fonte` (o desmonte das edições).
   */
  fontes?: Array<{ nome: string; url: string; detalhe?: string }>;
};

export const TITULO_DO_ESSENCIAL = "O que você precisa saber";
export const TITULO_DO_SIGNIFICADO = "O que isso significa para quem olha para os EUA";
export const TITULO_DO_LEIA_TAMBEM = "Leia também";
export const TITULO_DAS_FONTES = "Fontes";

/**
 * O corpo do artigo no portal. Sem cromo de e-mail, sem índice, sem rodapé:
 * a página do portal desenha o próprio cabeçalho.
 *
 * Bloco vazio não aparece: sem tópicos, sem caixa; sem significado, sem a
 * seção (o dono pediu o bloco SÓ quando a fonte sustenta); sem relacionadas
 * e sem editoria, sem "Leia também".
 */
export function renderizarArtigoHtml(artigo: Artigo, fonte: { nome: string; url: string }, extras: ExtrasDoHtml = {}): string {
  const partes: string[] = [];

  const essencial = artigo.essencial ?? [];
  if (essencial.length) {
    partes.push(
      `<section class="essencial"><h2>${TITULO_DO_ESSENCIAL}</h2><ul>${essencial.map((t) => `<li>${paragrafoHtml(t)}</li>`).join("")}</ul></section>`,
    );
  }

  const abertura = artigo.abertura ?? [];
  if (abertura.length) {
    partes.push(`<section class="abertura">${aberturaComLink(abertura, fonte).map((p) => `<p>${p}</p>`).join("")}</section>`);
  }

  for (const s of artigo.secoes) {
    partes.push(
      `<section>${s.intertitulo ? `<h2>${escapeHtml(s.intertitulo)}</h2>` : ""}${s.paragrafos.map((p) => `<p>${paragrafoHtml(p)}</p>`).join("")}</section>`,
    );
  }

  if (artigo.tabela && artigo.tabela.linhas.length >= 2) {
    const t = artigo.tabela;
    partes.push(
      `<section class="tabela"><div class="tabela-rolagem"><table>${t.titulo ? `<caption>${paragrafoHtml(t.titulo)}</caption>` : ""}<thead><tr>${t.colunas
        .map((c) => `<th scope="col">${paragrafoHtml(c)}</th>`)
        .join("")}</tr></thead><tbody>${t.linhas
        .map((l) => `<tr>${l.map((c) => `<td>${paragrafoHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div></section>`,
    );
  }

  const significado = artigo.significado ?? [];
  if (significado.length) {
    partes.push(`<section class="significado"><h2>${TITULO_DO_SIGNIFICADO}</h2>${significado.map((p) => `<p>${paragrafoHtml(p)}</p>`).join("")}</section>`);
  }

  const relacionadas = extras.relacionadas ?? [];
  if (relacionadas.length || extras.editoria) {
    const lista = relacionadas.length
      ? `<ul>${relacionadas.map((r) => `<li><a href="/artigos/${encodeURIComponent(r.slug)}">${escapeHtml(r.titulo)}</a></li>`).join("")}</ul>`
      : "";
    const editoria = extras.editoria
      ? `<p class="mais-da-editoria"><a href="${escapeHtml(extras.editoria.href)}">Mais de ${escapeHtml(extras.editoria.nome)}</a></p>`
      : "";
    partes.push(`<section class="leia-tambem"><h2>${TITULO_DO_LEIA_TAMBEM}</h2>${lista}${editoria}</section>`);
  }

  if (artigo.perguntas.length) {
    partes.push(
      `<section class="perguntas"><h2>Perguntas e respostas</h2>${artigo.perguntas
        .map((p) => `<h3>${escapeHtml(semMarcadorDeLink(p.pergunta))}</h3><p>${paragrafoHtml(p.resposta)}</p>`)
        .join("")}</section>`,
    );
  }

  if (extras.fontes) {
    const fontes = extras.fontes.filter((f) => safeHttpUrl(f.url, ""));
    if (fontes.length) {
      partes.push(
        `<section class="fontes"><h2>${TITULO_DAS_FONTES}</h2><ul>${fontes
          .map(
            (f) =>
              `<li><a href="${safeHttpUrl(f.url)}" rel="noopener" target="_blank">${escapeHtml(f.nome)}</a>${f.detalhe ? `, ${escapeHtml(f.detalhe)}` : ""}</li>`,
          )
          .join("")}</ul></section>`,
      );
    }
  } else if (fonte.url) {
    partes.push(`<p class="fonte">Fonte: <a href="${safeHttpUrl(fonte.url)}" rel="noopener" target="_blank">${escapeHtml(fonte.nome)}</a></p>`);
  }

  return partes.join("");
}

/**
 * As seções para a coluna `content`, que a página usa quando não há HTML: a
 * abertura entra como a primeira seção, sem intertítulo, como era antes do
 * molde.
 */
export function secoesParaConteudo(a: Artigo): Array<{ heading: string; paragraphs: string[] }> {
  const abertura = (a.abertura ?? []).map(semMarcadorDeLink);
  return [
    ...(abertura.length ? [{ heading: "", paragraphs: abertura }] : []),
    ...a.secoes.map((s) => ({ heading: s.intertitulo, paragraphs: s.paragrafos })),
    ...((a.significado ?? []).length ? [{ heading: TITULO_DO_SIGNIFICADO, paragraphs: a.significado ?? [] }] : []),
  ];
}

/** Palavras do corpo que o leitor lê, sem cromo de HTML. */
export function palavrasDoHtml(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const ROTULO_DO_EIXO: Record<string, string> = {
  economia: "Economia",
  trabalho: "Trabalho",
  custo_de_vida: "Custo de vida",
  politica: "Política",
  tecnologia: "Tecnologia",
  brasil: "Brasil",
};

/** A editoria do portal, com o mesmo mapa que a home usa para agrupar. */
export function categoriaDoArtigo(pauta: PautaAvaliada, titulo: string): string {
  const rotulo = ROTULO_DO_EIXO[pauta.classificacao.eixo] ?? String(pauta.classificacao.eixo ?? "");
  return nomeDaEditoria(editoriaDaPauta(rotulo, titulo));
}
