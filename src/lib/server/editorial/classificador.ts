import { z } from "zod";
import { callOpenAIJSON } from "../newsroom/ai-provider";
import type { ConfigEditorial } from "./config";
import { MOTIVOS } from "./config";
import type { Motivo } from "./config";
import type { Entidades } from "./fingerprint";

/**
 * Classificação editorial da pauta, antes de escrever.
 *
 * A ordem aqui é deliberada: classificar primeiro, escrever depois. Filtrar
 * durante a redação levaria o modelo a maquiar uma pauta ruim para ela caber
 * na linha editorial, e a linha é de seleção, não de maquiagem. Notícia
 * negativa sobre os EUA não entra; ela não é reescrita para parecer boa.
 *
 * A classificação sai do modelo, não de lista de palavras. Uma lista diria que
 * "deportação" é negativo e erraria a matéria sobre uma decisão que barra
 * deportação. O que a lista faz bem é outra coisa: nada.
 *
 * Entidades saem na mesma chamada porque são a mesma leitura do texto, e
 * porque a camada de repetição por ator e acontecimento depende delas.
 */

/**
 * Lista de texto tolerante ao que o modelo devolve de verdade.
 *
 * Com um ator só, ele escreve `"atores": "USCIS"` em vez de `["USCIS"]`. Isso
 * derrubava o lote inteiro na validação: dois lotes por rodada, vinte pautas
 * jogadas fora e pagas. O formato certo continua sendo a lista; aqui só se
 * aceita o singular sem perder as outras dezoito.
 */
const listaDeTexto = z.preprocess(
  (v) => {
    if (typeof v === "string") return v.trim() ? [v] : [];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  },
  z.array(z.string()).default([])
);

export const ClassificacaoSchema = z.object({
  id: z.string(),
  /** EUA, Brasil ou outro. "outro" cobre terceiro país e assunto sem país. */
  pais: z.enum(["EUA", "Brasil", "outro"]),
  /** A pauta trata de imigração, visto, status ou vida do imigrante? */
  imigracao: z.boolean(),
  /**
   * Como a notícia chega a quem quer se mudar para os EUA. Não é o tom do
   * texto: é o efeito do fato sobre o projeto de vida do leitor.
   */
  leitura: z.enum(["oportunidade", "neutra", "desfavoravel"]),
  eixo: z.enum([
    "oportunidade",
    "processo",
    "decisao_judicial",
    "custo_de_vida",
    "deterioracao_brasil",
    "outro",
  ]),
  /** 0 a 10, o quanto muda a vida de quem planeja a mudança. */
  relevancia: z.number().min(0).max(10),
  atores: listaDeTexto,
  lugares: listaDeTexto,
  acontecimento: listaDeTexto,
  justificativa: z.string().default(""),
});

export type Classificacao = z.infer<typeof ClassificacaoSchema>;

export const RespostaDoClassificadorSchema = z.object({
  pautas: z.array(ClassificacaoSchema),
});

export type PautaClassificavel = {
  id: string;
  titulo: string;
  descricao: string;
  fonte: string;
  url: string;
};

export function montarSystemDoClassificador(): string {
  return `
Você classifica notícias para uma publicação brasileira sobre imigração para os Estados Unidos.
O leitor é brasileiro e quer se mudar para os EUA legalmente.

Para cada notícia, devolva:

pais: "EUA" se o fato acontece nos Estados Unidos ou é decidido por autoridade americana. "Brasil" se acontece no Brasil ou é decidido por autoridade brasileira. "outro" nos demais casos.

imigracao: true quando a notícia trata de visto, green card, cidadania, asilo, fronteira, USCIS, consulado, status migratório, trabalho de estrangeiro ou vida de imigrante nos EUA.

leitura: como o FATO afeta o projeto de mudança do leitor, não o tom do texto.
- "oportunidade": abre, amplia, acelera, barateia ou protege um caminho. Exemplos: prazo estendido, nova categoria de visto, decisão que impede deportação, mais vagas, processo mais rápido.
- "neutra": informa sem mudar o caminho em nenhuma direção. Consulta pública, nomeação, dado estatístico, mudança de formulário.
- "desfavoravel": fecha, encarece, atrasa ou ameaça um caminho, ou retrata os EUA como lugar hostil, perigoso ou arbitrário. Exemplos: taxa maior, prazo maior, batida policial, prisão de imigrante, agente acusado de crime, corte de cota.

eixo: o assunto central.
- "oportunidade": abertura de caminho, programa, vaga, benefício.
- "processo": trâmite, formulário, prazo, taxa, consulado.
- "decisao_judicial": corte, juiz, liminar, processo criminal.
- "custo_de_vida": moradia, salário, imposto, câmbio.
- "deterioracao_brasil": fato brasileiro com efeito prático sobre patrimônio, empresa, carreira ou segurança. Instituições, tributação, economia, segurança jurídica e violência entram aqui quando há fato, e não quando há apenas opinião ou disputa política.
- "outro": o que não couber acima.

relevancia: 0 a 10, e a régua depende do país.

Para notícia dos EUA: quanto o fato muda, na prática, o plano de quem quer morar lá. Nomeação de cargo sem efeito prático é 1. Mudança de prazo de um formulário que milhares usam é 8. Nova categoria de visto ou decisão que destrava uma fila é 9.

Para notícia do Brasil: quanto existe ali um PROBLEMA FACTUAL CONCRETO que afeta quem tem patrimônio, empresa ou carreira. Vale de 6 a 9 quando há fato verificável com alcance: mudança de alíquota, decisão que muda regra do jogo, número de inflação, câmbio, juros, dado de violência, decisão institucional com efeito prático. Fofoca de bastidor, disputa de cargo, declaração de político e pesquisa eleitoral isolada valem 1 a 3.

O que decide a nota é o fato, não a conclusão. Não force leitura negativa: se a notícia brasileira traz um dado bom ou neutro, classifique como está. A publicação compara Brasil e Estados Unidos com números, não com adjetivos, e não adota lado partidário: nenhum partido, nenhum político e nenhuma corrente são o assunto. O assunto é o efeito prático sobre a vida de quem decide ficar ou sair.

Para notícia de terceiro país: só interessa se afetar brasileiro que emigra. Caso contrário, 0.

atores: órgãos, empresas, tribunais e pessoas citados. Nomes curtos, como aparecem ("USCIS", "ICE", "Suprema Corte", "STF").
lugares: cidades, estados e países citados.
acontecimento: 1 a 3 substantivos do que aconteceu ("prorrogação", "liminar", "prisão", "aumento de taxa").

justificativa: uma frase curta explicando a leitura escolhida.

Classifique o que está escrito. Não deduza intenção, não suavize e não agrave. Devolva JSON: {"pautas": [...]} com um objeto por notícia, preservando o "id" recebido.
`.trim();
}

export function montarUserDoClassificador(pautas: PautaClassificavel[]): string {
  const lista = pautas
    .map(
      (p) =>
        `id: ${p.id}\ntitulo: ${p.titulo}\nfonte: ${p.fonte}\nurl: ${p.url}\nresumo: ${p.descricao.slice(0, 600)}`
    )
    .join("\n\n---\n\n");

  return `Classifique as ${pautas.length} notícias abaixo.\n\n${lista}`;
}

/**
 * Quantas pautas por chamada.
 *
 * Mandar as 201 candidatas de uma vez devolveu 38 classificadas, sem erro: o
 * modelo simplesmente parou no meio e o JSON veio válido e curto. Como pauta
 * sem classificação é recusada por precaução, isso jogaria fora 80% da coleta
 * todo dia, e o log diria apenas "não classificada".
 */
const PAUTAS_POR_CHAMADA = 20;
/** Chamadas simultâneas. Acima disso a API começa a devolver 429. */
const CHAMADAS_EM_PARALELO = 4;

/**
 * Classifica todas as pautas, em lotes.
 *
 * Um lote que falha não derruba os outros: ele volta como pauta ausente do
 * mapa, e quem chama recusa essas pautas por falta de classificação. Seguir
 * sem classificação seria publicar sem o filtro editorial, que é o contrário
 * do que este módulo existe para fazer.
 */
export async function classificarPautas(
  pautas: PautaClassificavel[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{
  classificacoes: Map<string, Classificacao>;
  custoUsd: number;
  /**
   * Tokens gastos, separados do custo de propósito.
   *
   * `custoUsd` sai de uma tabela de preço escrita no código para os modelos da
   * família 4o. O modelo configurado hoje é outro, então aquele número é uma
   * referência, não uma fatura. Token é medida, e é o que serve para projetar
   * custo com o preço real de quem estiver atendendo.
   */
  tokens: { prompt: number; completion: number; total: number };
  lotesComFalha: string[];
}> {
  if (pautas.length === 0) {
    return {
      classificacoes: new Map(),
      custoUsd: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      lotesComFalha: [],
    };
  }

  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const lotes: PautaClassificavel[][] = [];
  for (let i = 0; i < pautas.length; i += PAUTAS_POR_CHAMADA) {
    lotes.push(pautas.slice(i, i + PAUTAS_POR_CHAMADA));
  }

  const mapa = new Map<string, Classificacao>();
  const lotesComFalha: string[] = [];
  let custoUsd = 0;
  const tokens = { prompt: 0, completion: 0, total: 0 };

  for (let i = 0; i < lotes.length; i += CHAMADAS_EM_PARALELO) {
    const rodada = lotes.slice(i, i + CHAMADAS_EM_PARALELO);
    const respostas = await Promise.all(
      rodada.map(async (lote, j) => {
        try {
          const { data, usage } = await callOpenAIJSON<unknown>(
            [
              { role: "system", content: montarSystemDoClassificador() },
              { role: "user", content: montarUserDoClassificador(lote) },
            ],
            modelo,
            env,
            fetcher
          );

          const parsed = RespostaDoClassificadorSchema.safeParse(data);
          if (!parsed.success) {
            return {
              erro: `lote ${i + j + 1}: formato inválido, ${parsed.error.issues[0]?.message ?? ""}`,
              custo: usage.estimatedCostUsd,
              usage,
              itens: [] as Classificacao[],
            };
          }
          return { erro: null, custo: usage.estimatedCostUsd, usage, itens: parsed.data.pautas };
        } catch (erro) {
          return {
            erro: `lote ${i + j + 1}: ${(erro as Error).message}`,
            custo: 0,
            usage: null,
            itens: [] as Classificacao[],
          };
        }
      })
    );

    for (const r of respostas) {
      custoUsd += r.custo;
      if (r.usage) {
        tokens.prompt += r.usage.promptTokens;
        tokens.completion += r.usage.completionTokens;
        tokens.total += r.usage.totalTokens;
      }
      if (r.erro) lotesComFalha.push(r.erro);
      for (const c of r.itens) mapa.set(c.id, c);
    }
  }

  return { classificacoes: mapa, custoUsd, tokens, lotesComFalha };
}

export function entidadesDaClassificacao(c: Classificacao): Entidades {
  return { atores: c.atores, lugares: c.lugares, acontecimento: c.acontecimento };
}

export type DecisaoEditorial = {
  aprovada: boolean;
  motivo: Motivo;
  explicacao: string;
};

/**
 * A regra de seleção.
 *
 * Notícia desfavorável sobre os EUA não entra. Isso é decisão do dono da
 * publicação, tomada depois de eu levantar o custo de o leitor ficar sem
 * informação relevante para decidir a mudança, e reafirmada. Fica registrada
 * aqui como regra explícita, com código próprio no log, para que o efeito
 * dela seja auditável e reversível numa linha, em vez de virar um viés
 * espalhado pelos prompts.
 *
 * Sobre o Brasil, o negativo entra: é o outro lado da mesma comparação.
 */
export function decidirPauta(c: Classificacao, config: ConfigEditorial): DecisaoEditorial {
  if (c.pais === "EUA" && c.leitura === "desfavoravel") {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_EUA_NEGATIVO,
      explicacao: `EUA com leitura desfavorável: ${c.justificativa || "sem justificativa"}`,
    };
  }

  const piso = config.relevanciaMinima;
  if (c.relevancia < piso) {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_RELEVANCIA,
      explicacao: `relevância ${c.relevancia} abaixo do piso ${piso}`,
    };
  }

  if (c.pais === "Brasil") {
    // Assunto brasileiro só entra pelo eixo que interessa ao leitor que
    // pensa em sair: instituição, tributo, economia, segurança. Notícia
    // brasileira qualquer não é pauta desta publicação.
    const noEixo = c.eixo === "deterioracao_brasil" || c.eixo === "custo_de_vida" || c.imigracao;
    if (!noEixo) {
      return {
        aprovada: false,
        motivo: MOTIVOS.REJEITADO_RELEVANCIA,
        explicacao: `Brasil fora do eixo editorial (eixo ${c.eixo})`,
      };
    }
    return {
      aprovada: true,
      motivo:
        c.leitura === "desfavoravel"
          ? MOTIVOS.APROVADO_DESAFIO_BRASIL
          : MOTIVOS.APROVADO_CONTEXTO_BRASIL,
      explicacao: `Brasil, eixo ${c.eixo}, leitura ${c.leitura}, relevância ${c.relevancia}`,
    };
  }

  if (c.pais === "outro" && !c.imigracao) {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_SEM_CLASSIFICACAO,
      explicacao: "fora de EUA e Brasil e sem relação com imigração",
    };
  }

  if (c.imigracao) {
    return {
      aprovada: true,
      motivo: MOTIVOS.APROVADO_IMIGRACAO,
      explicacao: `imigração, leitura ${c.leitura}, relevância ${c.relevancia}`,
    };
  }

  return {
    aprovada: true,
    motivo: MOTIVOS.APROVADO_OPORTUNIDADE_EUA,
    explicacao: `EUA, leitura ${c.leitura}, eixo ${c.eixo}, relevância ${c.relevancia}`,
  };
}

/* ------------------------------------------------------------------ */
/* Extração de entidade sobre material já publicado                    */
/* ------------------------------------------------------------------ */

const EntidadesExtraidasSchema = z.object({
  pautas: z.array(
    z.object({
      id: z.string(),
      atores: listaDeTexto,
      lugares: listaDeTexto,
      acontecimento: listaDeTexto,
    })
  ),
});

export function montarSystemDoExtratorDeEntidades(): string {
  return `
Você extrai entidades de notícias já publicadas, para um índice interno.

Para cada item, devolva:

atores: órgãos, empresas, tribunais, cargos e pessoas que PARTICIPAM do fato, como aparecem no texto ("USCIS", "ICE", "STF", "Suprema Corte"). NÃO inclua o veículo que publicou nem quem apenas noticiou o fato: jornal, agência, site e revista ficam de fora, mesmo citados no texto. Se o único nome do texto for o do veículo, a lista fica vazia.
lugares: cidades, estados e países CITADOS no texto recebido.
acontecimento: 1 a 3 substantivos do que aconteceu, usando as palavras do próprio texto ("prorrogação", "liminar", "prisão", "aumento de taxa").

Regra única e absoluta: só entra o que está escrito no material recebido. Não deduza o órgão responsável, não complete o país, não infira o tipo de evento a partir do assunto. Se o texto não diz, a lista fica vazia. Lista vazia é resposta correta.

Devolva JSON: {"pautas": [{"id": "...", "atores": [], "lugares": [], "acontecimento": []}]}, preservando o id recebido.
`.trim();
}

export async function extrairEntidades(
  pautas: Array<{ id: string; titulo: string; resumo: string; fonte: string }>,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ entidades: Map<string, Entidades>; custoUsd: number; tokens: number; falhas: string[] }> {
  const saida = new Map<string, Entidades>();
  const falhas: string[] = [];
  let custoUsd = 0;
  let tokens = 0;

  if (pautas.length === 0) return { entidades: saida, custoUsd, tokens, falhas };

  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";

  for (let i = 0; i < pautas.length; i += PAUTAS_POR_CHAMADA) {
    const lote = pautas.slice(i, i + PAUTAS_POR_CHAMADA);
    const corpo = lote
      .map((p) => `id: ${p.id}\ntitulo: ${p.titulo}\nfonte: ${p.fonte}\ntexto: ${p.resumo.slice(0, 800)}`)
      .join("\n\n---\n\n");

    try {
      const { data, usage } = await callOpenAIJSON<unknown>(
        [
          { role: "system", content: montarSystemDoExtratorDeEntidades() },
          { role: "user", content: `Extraia as entidades dos ${lote.length} itens abaixo.\n\n${corpo}` },
        ],
        modelo,
        env,
        fetcher
      );

      custoUsd += usage.estimatedCostUsd;
      tokens += usage.totalTokens;

      const parsed = EntidadesExtraidasSchema.safeParse(data);
      if (!parsed.success) {
        falhas.push(`lote ${i / PAUTAS_POR_CHAMADA + 1}: ${parsed.error.issues[0]?.message ?? "formato"}`);
        continue;
      }

      for (const p of parsed.data.pautas) {
        saida.set(p.id, {
          atores: p.atores,
          lugares: p.lugares,
          acontecimento: p.acontecimento,
        });
      }
    } catch (erro) {
      falhas.push(`lote ${i / PAUTAS_POR_CHAMADA + 1}: ${(erro as Error).message}`);
    }
  }

  return { entidades: saida, custoUsd, tokens, falhas };
}
