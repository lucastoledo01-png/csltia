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

/**
 * Amostragem do classificador, e o que a medição mostrou sobre ela.
 *
 * O problema é real e está medido: 120 candidatas, coletadas UMA vez e
 * classificadas três, aprovaram 17, 11 e 26. A relevância mudou em 64% delas,
 * os atores em 42%, e a decisão de entrar ou não virou em 24%, com dois terços
 * das viradas LONGE do piso, não em cima dele. `pais` e `imigracao`, que são
 * categóricos, não variaram uma única vez: o que oscila é o juízo graduado,
 * que é exatamente o que decide a edição.
 *
 * Duas saídas por parâmetro foram testadas, e nenhuma serve:
 *
 *   `temperature: 0` derruba a chamada inteira. O modelo em uso responde
 *   "does not support 0 with this model. Only the default (1) value is
 *   supported", e o resultado foi três rodadas com zero candidatas
 *   classificadas.
 *
 *   `seed` é aceito e NÃO resolveu. Com semente fixa e a mesma entrada, as
 *   três rodadas aprovaram 8, 5 e 19, com a relevância ainda mudando em 67%.
 *   A semente é melhor esforço, e neste modelo, com prompt longo e em lote,
 *   ela não segura o julgamento.
 *
 * Por isso o padrão é não mandar nada, que é o comportamento de sempre. O
 * caminho que sobra não é de parâmetro: é classificar uma vez, PERSISTIR, e
 * reusar a classificação nos dois canais e nos dias seguintes. Aí a variação
 * deixa de existir para uma candidata já vista, e a discussão passa a ser
 * sobre a qualidade de um sorteio só.
 *
 * Os dois valores continuam ligáveis por ambiente, para quando o modelo mudar:
 *   EDITORIAL_CLASSIFIER_SEED=20260906
 *   EDITORIAL_CLASSIFIER_TEMPERATURE=0
 */
export function amostragemDeJulgamento(
  env: Record<string, string | undefined> = process.env
): { temperature?: number; seed?: number } {
  const t = Number(env.EDITORIAL_CLASSIFIER_TEMPERATURE);
  const semente = Number(env.EDITORIAL_CLASSIFIER_SEED);

  return {
    ...(Number.isFinite(t) && t >= 0 ? { temperature: t } : {}),
    ...(Number.isFinite(semente) ? { seed: semente } : {}),
  };
}

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
  /**
   * O que aconteceu de fato: um ato, ou alguém falando sobre um ato.
   *
   * A distinção existe porque "declaração vale pouco" é regra grossa demais.
   * O presidente anunciar oficialmente uma medida é ato. Um candidato criticar
   * a medida do adversário é fala. Os dois chegam ao feed como notícia, e só
   * um deles é fato novo.
   */
  natureza: z.enum(["official_action", "political_statement", "outro"]).default("outro"),
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
- "custo_de_vida": o que muda o bolso de quem lê. Moradia, salário, imposto sobre renda ou patrimônio, câmbio, juros, preço ao consumidor. NÃO entra aqui disputa comercial entre países, preço de commodity, cotação de exportação nem resultado de empresa: isso é economia setorial, e o leitor não é produtor nem investidor institucional. Só entra se a matéria disser o efeito no preço que o leitor paga.
- "deterioracao_brasil": fato brasileiro com efeito prático sobre patrimônio, empresa, carreira ou segurança. Instituições, tributação, economia, segurança jurídica e violência entram aqui quando há fato, e não quando há apenas opinião ou disputa política.
- "outro": o que não couber acima.

relevancia: 0 a 10, e a régua depende do país.

Para notícia dos EUA: quanto o fato muda, na prática, o plano de quem quer morar lá. Nomeação de cargo sem efeito prático é 1. Mudança de prazo de um formulário que milhares usam é 8. Nova categoria de visto ou decisão que destrava uma fila é 9.

Para notícia do Brasil: quanto existe ali um PROBLEMA FACTUAL CONCRETO que afeta quem tem patrimônio, empresa ou carreira, e que pesa na decisão de ficar ou sair. Notícia setorial, disputa comercial, safra, exportação e balanço de empresa não pesam nessa decisão: valem 1 a 3, por maior que seja o número envolvido. Vale de 6 a 9 quando há fato verificável com alcance: mudança de alíquota, decisão que muda regra do jogo, número de inflação, câmbio, juros, dado de violência, decisão institucional com efeito prático. Fofoca de bastidor, disputa de cargo, declaração de político e pesquisa eleitoral isolada valem 1 a 3.

O que decide a nota é o fato, não a conclusão. Não force leitura negativa: se a notícia brasileira traz um dado bom ou neutro, classifique como está. A publicação compara Brasil e Estados Unidos com números, não com adjetivos, e não adota lado partidário: nenhum partido, nenhum político e nenhuma corrente são o assunto. O assunto é o efeito prático sobre a vida de quem decide ficar ou sair.

natureza: o que a notícia registra.
- "official_action": um ato. Decisão, assinatura, sanção, votação, publicação de regra, anúncio oficial de órgão ou autoridade sobre a própria competência, dado estatístico divulgado, medida que entrou em vigor. Vale a relevância do fato, que pode ser alta.
- "political_statement": alguém falando sobre um ato. Crítica, promessa de campanha, opinião, ataque, reação, entrevista, declaração eleitoral, pesquisa de intenção de voto. Ainda que o assunto seja importante, o fato novo aqui é só a fala.
- "outro": o que não for nem um nem outro.

Um anúncio oficial do presidente sobre uma medida do próprio governo é "official_action". Um candidato criticando essa medida é "political_statement". A mesma história contada pelo lado do ato ("Senado aprova fim da cobrança de 20%") é ato; contada pelo lado da fala ("Fulano critica o fim da cobrança") é fala.

Para notícia de terceiro país: só interessa se afetar brasileiro que emigra. Caso contrário, 0.

atores: órgãos, empresas, tribunais e pessoas citados. Nomes curtos, como aparecem ("USCIS", "ICE", "Suprema Corte", "STF").
lugares: cidades, estados e países citados.
acontecimento: 1 a 3 substantivos do que aconteceu ("prorrogação", "liminar", "prisão", "aumento de taxa").

justificativa: uma frase curta explicando a leitura escolhida.

Classifique o que está escrito. Não deduza intenção, não suavize e não agrave. Devolva JSON: {"pautas": [...]} com um objeto por notícia, preservando o "id" recebido.
`.trim();
}

/**
 * Quanto texto o classificador enxerga de cada pauta.
 *
 * Era 600, e o verificador lia 2500 do mesmo texto. A `guarda.ts` já entregava
 * 4000 caracteres da matéria enriquecida para a segunda classificação, com um
 * comentário dizendo que ela existe para "julgar o texto que existe, e não o
 * que o agregador resumiu"; este corte anulava aquilo em silêncio.
 *
 * A consequência aparecia no fim do funil: os conflitos por
 * `relevancia_no_piso` eram o sistema descobrindo, tarde, que a classificação
 * tinha sido feita sobre um texto truncado. Numa pauta do DHS, os 1900
 * caracteres que só o verificador viu continham a liminar que suspendia a
 * regra inteira.
 *
 * O número é o mesmo do verificador de propósito. Os dois julgam o mesmo
 * texto, ou a divergência entre eles não significa nada.
 */
export const LIMITE_DO_RESUMO = 2500;

export function montarUserDoClassificador(pautas: PautaClassificavel[]): string {
  const lista = pautas
    .map(
      (p) =>
        `id: ${p.id}\ntitulo: ${p.titulo}\nfonte: ${p.fonte}\nurl: ${p.url}\nresumo: ${p.descricao.slice(0, LIMITE_DO_RESUMO)}`
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

/**
 * E quanto texto por chamada.
 *
 * O teto de 20 pautas foi calibrado quando cada resumo tinha 600 caracteres:
 * 12 mil no total, e o modelo respondia inteiro. Ao subir o resumo para 2500
 * para o classificador ler o mesmo que o verificador, 20 pautas viraram 50 mil
 * caracteres e o modelo voltou a parar no meio, exatamente como descrito
 * acima. Na medição de sete dias isso apareceu como 45 pautas
 * `REJECT_UNCLASSIFIED`, contra 1 antes.
 *
 * Contar pauta não protege de nada: o que estoura é o texto. O lote fecha por
 * quantidade OU por caracteres, o que vier primeiro, e o orçamento é o mesmo
 * volume que já funcionava.
 */
const CARACTERES_POR_CHAMADA = 13_000;

/**
 * O que uma pauta ocupa no prompt.
 *
 * Uma pauta sozinha maior que o orçamento ainda entra: o corte de
 * `LIMITE_DO_RESUMO` já limita o pior caso, e deixá-la de fora seria recusá-la
 * por tamanho. Os 120 cobrem os rótulos do formato (`id:`, `titulo:`, `fonte:`,
 * `url:`, `resumo:`) e o separador entre pautas.
 */
function custoEmCaracteres(pauta: PautaClassificavel): number {
  return Math.min(pauta.descricao.length, LIMITE_DO_RESUMO) + pauta.titulo.length + 120;
}
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
  /** Quanto o retry dos ids ausentes custou e recuperou. */
  diagnostico: { ausentesNaPrimeira: number; reclassificados: number; chamadasDeRetry: number };
}> {
  if (pautas.length === 0) {
    return {
      classificacoes: new Map(),
      custoUsd: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      lotesComFalha: [],
      diagnostico: { ausentesNaPrimeira: 0, reclassificados: 0, chamadasDeRetry: 0 },
    };
  }

  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const lotes: PautaClassificavel[][] = [];
  let atual: PautaClassificavel[] = [];
  let caracteres = 0;
  for (const pauta of pautas) {
    // Uma pauta sozinha maior que o orçamento ainda entra: o corte de
    // `LIMITE_DO_RESUMO` já limita o pior caso, e deixá-la de fora seria
    // recusá-la por tamanho.
    const custo = custoEmCaracteres(pauta);
    if (atual.length > 0 && (atual.length >= PAUTAS_POR_CHAMADA || caracteres + custo > CARACTERES_POR_CHAMADA)) {
      lotes.push(atual);
      atual = [];
      caracteres = 0;
    }
    atual.push(pauta);
    caracteres += custo;
  }
  if (atual.length > 0) lotes.push(atual);

  const mapa = new Map<string, Classificacao>();
  const lotesComFalha: string[] = [];
  let custoUsd = 0;
  const tokens = { prompt: 0, completion: 0, total: 0 };

  const chamarLote = async (lote: PautaClassificavel[], nome: string) => {
    try {
      const { data, usage } = await callOpenAIJSON<unknown>(
        [
          { role: "system", content: montarSystemDoClassificador() },
          { role: "user", content: montarUserDoClassificador(lote) },
        ],
        modelo,
        env,
        fetcher,
        amostragemDeJulgamento(env),
      );

      const parsed = RespostaDoClassificadorSchema.safeParse(data);
      if (!parsed.success) {
        return {
          erro: `${nome}: formato inválido, ${parsed.error.issues[0]?.message ?? ""}`,
          custo: usage.estimatedCostUsd,
          usage,
          itens: [] as Classificacao[],
        };
      }
      return { erro: null, custo: usage.estimatedCostUsd, usage, itens: parsed.data.pautas };
    } catch (erro) {
      return {
        erro: `${nome}: ${(erro as Error).message}`,
        custo: 0,
        usage: null,
        itens: [] as Classificacao[],
      };
    }
  };

  const somar = (r: Awaited<ReturnType<typeof chamarLote>>) => {
    custoUsd += r.custo;
    if (r.usage) {
      tokens.prompt += r.usage.promptTokens;
      tokens.completion += r.usage.completionTokens;
      tokens.total += r.usage.totalTokens;
    }
    if (r.erro) lotesComFalha.push(r.erro);
    for (const c of r.itens) mapa.set(c.id, c);
  };

  for (let i = 0; i < lotes.length; i += CHAMADAS_EM_PARALELO) {
    const rodada = lotes.slice(i, i + CHAMADAS_EM_PARALELO);
    const respostas = await Promise.all(rodada.map((lote, j) => chamarLote(lote, `lote ${i + j + 1}`)));
    for (const r of respostas) somar(r);
  }

  /*
   * Os ids que o modelo simplesmente não devolveu.
   *
   * O lote volta com JSON válido e mais curto que o pedido, sem erro nenhum, e
   * as pautas ausentes são recusadas por precaução mais adiante, como
   * `REJECT_UNCLASSIFIED`. Na medição de sete dias isso apareceu como 42
   * pautas num relatório e 5 no seguinte, com o mesmo código: a omissão é
   * intermitente, e uma segunda tentativa costuma pegar.
   *
   * Repetir o lote inteiro seria pagar de novo por tudo que já veio. Aqui só os
   * ausentes voltam, uma vez. Se ainda faltarem, ficam sem classificação, que é
   * o comportamento antigo e continua sendo o certo: seguir sem classificação
   * seria publicar sem o filtro editorial.
   */
  const ausentes = pautas.filter((p) => !mapa.has(p.id));
  const diagnostico = { ausentesNaPrimeira: ausentes.length, reclassificados: 0, chamadasDeRetry: 0 };

  if (ausentes.length > 0) {
    console.warn(
      `[CLASSIFICADOR] ${ausentes.length} de ${pautas.length} pautas voltaram sem classificação. ` +
        `Repetindo só as ausentes, uma vez.`,
    );

    const lotesDeRetry: PautaClassificavel[][] = [];
    let atualRetry: PautaClassificavel[] = [];
    let caracteresRetry = 0;
    for (const pauta of ausentes) {
      const custo = custoEmCaracteres(pauta);
      if (
        atualRetry.length > 0 &&
        (atualRetry.length >= PAUTAS_POR_CHAMADA || caracteresRetry + custo > CARACTERES_POR_CHAMADA)
      ) {
        lotesDeRetry.push(atualRetry);
        atualRetry = [];
        caracteresRetry = 0;
      }
      atualRetry.push(pauta);
      caracteresRetry += custo;
    }
    if (atualRetry.length > 0) lotesDeRetry.push(atualRetry);

    diagnostico.chamadasDeRetry = lotesDeRetry.length;

    for (let i = 0; i < lotesDeRetry.length; i += CHAMADAS_EM_PARALELO) {
      const rodada = lotesDeRetry.slice(i, i + CHAMADAS_EM_PARALELO);
      const respostas = await Promise.all(
        rodada.map((lote, j) => chamarLote(lote, `retry ${i + j + 1}`)),
      );
      for (const r of respostas) somar(r);
    }

    diagnostico.reclassificados = ausentes.filter((p) => mapa.has(p.id)).length;
    console.log(
      `[CLASSIFICADOR] Retry recuperou ${diagnostico.reclassificados} de ${ausentes.length} ` +
        `em ${diagnostico.chamadasDeRetry} chamada(s).`,
    );
  }

  return { classificacoes: mapa, custoUsd, tokens, lotesComFalha, diagnostico };
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

  /*
   * Fala não vale o que o ato vale.
   *
   * A régua não é "declaração é irrelevante": anúncio oficial também sai da
   * boca de alguém e é ato. O que perde peso é a fala SOBRE o ato, que em ano
   * eleitoral enche o feed e leva a publicação para dentro da disputa
   * partidária. O teto deixa passar a fala que for excepcional e mantém o
   * resto abaixo do piso.
   */
  const relevanciaEfetiva =
    c.natureza === "political_statement" ? Math.min(c.relevancia, config.tetoDeDeclaracao) : c.relevancia;

  const piso = config.relevanciaMinima;
  if (relevanciaEfetiva < piso) {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_RELEVANCIA,
      explicacao:
        c.natureza === "political_statement"
          ? `declaração política, relevância ${c.relevancia} limitada a ${relevanciaEfetiva}, abaixo do piso ${piso}`
          : `relevância ${c.relevancia} abaixo do piso ${piso}`,
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
        fetcher,
        amostragemDeJulgamento(env),
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
