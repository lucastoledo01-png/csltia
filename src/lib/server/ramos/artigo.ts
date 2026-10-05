import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { limparVicios } from "../newsroom/anti-vicios";
import type { PautaAvaliada } from "../editorial/guarda";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { validarAncoragem } from "../editorial/pacote-factual";
import type { ClaimNaoSustentada } from "../editorial/pacote-factual";
import { auditarClaims } from "../editorial/claims-semanticas";
import type { ClaimSemantica } from "../editorial/claims-semanticas";
import { escapeHtml, safeHttpUrl } from "../html";
import { editoriaDaPauta, nomeDaEditoria } from "@/lib/editorias";
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

export const ArtigoSchema = z.object({
  /** O título da página. Diz o assunto com as palavras de quem busca. */
  titulo: z.string().min(10),
  subtitulo: aparar(220).pipe(z.string()).default(""),
  /** O título que vai para o resultado de busca. O Google corta perto de 60. */
  titulo_seo: aparar(70).pipe(z.string().min(10)),
  descricao_seo: aparar(160).pipe(z.string().min(20)),
  secoes: z
    .array(
      z.object({
        intertitulo: z.string().default(""),
        paragrafos: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(6),
  /**
   * Perguntas e respostas para a busca por resposta (a coluna `aeo_questions`,
   * que era a única de SEO ainda vazia). Só entra pergunta cuja resposta está
   * no pacote, e por isso elas passam pelo mesmo auditor do corpo.
   */
  perguntas: z
    .array(z.object({ pergunta: z.string().min(5), resposta: z.string().min(5) }))
    .max(4)
    .default([]),
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

FORMA:
- Sem travessão. Sem emoji. Sem saudação nem despedida.
- De duas a quatro seções, cada uma com intertítulo afirmativo e de um a três parágrafos curtos. A primeira seção pode ter intertítulo vazio: é o lide.
- Perguntas: de zero a quatro, só as que o pacote responde inteiras. Zero é resposta correta.

Devolva EXCLUSIVAMENTE este JSON:
{"titulo":"...","subtitulo":"...","titulo_seo":"...","descricao_seo":"...","secoes":[{"intertitulo":"","paragrafos":["..."]}],"perguntas":[{"pergunta":"...","resposta":"..."}]}
`.trim();
}

function montarUserDoArtigo(pauta: PautaAvaliada, pacote: PacoteFactual): string {
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

/** Todo o texto que o leitor vê, para o auditor ler o mesmo que o leitor. */
export function textoDoArtigo(a: Artigo): string {
  return [
    a.titulo,
    a.subtitulo,
    a.titulo_seo,
    a.descricao_seo,
    ...a.secoes.flatMap((s) => [s.intertitulo, ...s.paragrafos]),
    ...a.perguntas.flatMap((p) => [p.pergunta, p.resposta]),
  ]
    .filter(Boolean)
    .join("\n");
}

export type VeredictoDoArtigo = {
  aprovado: boolean;
  bloqueios: string[];
  avisos: string[];
  ancoragem: { conferidos: number; naoSustentadas: ClaimNaoSustentada[] };
  conclusoesSemLastro: ClaimSemantica[];
};

/**
 * O auditor do ramo. Determinístico primeiro, modelo depois.
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
  const texto = textoDoArtigo(artigo);
  const anc = validarAncoragem(texto, pacote);

  const claims = await auditarClaims(
    [{ indice: 0, titulo: artigo.titulo, texto, pacote }],
    opcoes.env ?? process.env,
    opcoes.fetcher ?? fetch,
  );
  opcoes.livro?.lancar("auditoria_claims", "artigo", claims.custoUsd, claims.tokens);

  const bloqueios: string[] = [];
  const avisos: string[] = [];

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
  }
  if (claims.erro) avisos.push(`auditoria de conclusões não rodou: ${claims.erro}`);

  return {
    aprovado: bloqueios.length === 0,
    bloqueios,
    avisos,
    ancoragem: { conferidos: anc.conferidos, naoSustentadas: anc.naoSustentadas },
    conclusoesSemLastro: claims.naoSustentadas,
  };
}

export type ResultadoDoArtigo = {
  artigo: Artigo | null;
  veredicto: VeredictoDoArtigo;
  tentativas: number;
  erro: string | null;
};

/**
 * Escreve, audita e tenta UM reparo.
 *
 * Um, e não dois como a newsletter: aqui a peça é uma matéria só, e o que
 * sobra depois de um reparo é a matéria sair do dia, sem levar nada junto.
 */
export async function escreverArtigoDaPauta(
  pauta: PautaAvaliada,
  pacote: PacoteFactual,
  marca: MarcaDoArtigo,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; livro?: LivroDeCustos } = {},
): Promise<ResultadoDoArtigo> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const system = montarSystemDoArtigo(marca);
  const user = montarUserDoArtigo(pauta, pacote);

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
      // O reparo falhou tecnicamente. O veredito de antes continua valendo:
      // reprovado, e a matéria não sai.
      veredicto = {
        ...veredicto,
        avisos: [...veredicto.avisos, `reparo não rodou: ${erro instanceof Error ? erro.message : String(erro)}`],
      };
    }
  }

  return { artigo, veredicto, tentativas, erro: null };
}

/** Negrito do redator vira <strong>, e só depois de o texto estar escapado. */
function paragrafoHtml(texto: string): string {
  return escapeHtml(texto).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*/g, "");
}

/**
 * O corpo do artigo no portal. Sem cromo de e-mail, sem índice, sem rodapé:
 * a página do portal desenha o próprio cabeçalho.
 */
export function renderizarArtigoHtml(artigo: Artigo, fonte: { nome: string; url: string }): string {
  const secoes = artigo.secoes
    .map(
      (s) =>
        `<section>${s.intertitulo ? `<h2>${escapeHtml(s.intertitulo)}</h2>` : ""}${s.paragrafos
          .map((p) => `<p>${paragrafoHtml(p)}</p>`)
          .join("")}</section>`,
    )
    .join("");
  const perguntas = artigo.perguntas.length
    ? `<section><h2>Perguntas e respostas</h2>${artigo.perguntas
        .map((p) => `<h3>${escapeHtml(p.pergunta)}</h3><p>${paragrafoHtml(p.resposta)}</p>`)
        .join("")}</section>`
    : "";
  const credito = fonte.url
    ? `<p class="fonte">Fonte: <a href="${safeHttpUrl(fonte.url)}" rel="noopener" target="_blank">${escapeHtml(fonte.nome)}</a></p>`
    : "";
  return `${secoes}${perguntas}${credito}`;
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
