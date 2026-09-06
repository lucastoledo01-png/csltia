import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import { limparVicios } from "../newsroom/anti-vicios";

/**
 * O texto de um post, escrito para o feed e não para o e-mail.
 *
 * A diferença não é de tom, é de forma. A newsletter tem assunto, preheader,
 * intro, pautas e fechamento, e o leitor chegou nela por escolha. O post tem
 * uma manchete que precisa parar o polegar e uma legenda que ninguém abre se
 * a primeira linha não segurar. Reaproveitar a copy do e-mail produz post que
 * parece boletim, e foi assim que "Até amanhã. Equipe imigra.us." apareceu
 * embaixo de um CTA.
 *
 * Tudo aqui é escrito a partir do PACOTE FACTUAL, não da matéria. O pacote é
 * a lista do que está escrito na fonte; o que não está nele não pode aparecer
 * no post, e é isso que a guarda social confere depois.
 */

export const CopyDoPostSchema = z.object({
  /**
   * A manchete da arte. Curta porque ela é grande na imagem.
   *
   * O limite de palavras não é estética: a arte tem três linhas e um título
   * longo encolhe até ficar ilegível no celular.
   */
  headline: z.string().min(8).max(90),
  /** A expressão do headline que sai em cor. Copiada literalmente dele. */
  destaque: z.string().default(""),
  gancho: z.string().min(10).max(120),
  fato_principal: z.string().min(20).max(320),
  contexto: z.string().max(400).default(""),
  informacao_util: z.string().max(300).default(""),
  /** O que a matéria NÃO diz, quando calar seria enganoso. */
  ressalva: z.string().max(240).default(""),
  cta: z.string().min(10).max(200),
  hashtags: z.array(z.string()).min(3).max(10).default([]),
});

export type CopyDoPost = z.infer<typeof CopyDoPostSchema>;

export type MarcaSocial = {
  nome: string;
  nicho: string;
  extra: string;
  keyword: string;
};

/**
 * O CTA varia, a ação não.
 *
 * Todo post terminando com a mesma frase transforma o perfil em gravação. As
 * variações pedem a mesma coisa e prometem a mesma coisa: avaliação de perfil
 * e quais caminhos combinam. Nenhuma promete aprovação, elegibilidade, prazo
 * ou custo, porque isso só um advogado diz depois de ver o caso.
 */
export const FORMAS_DE_CTA = [
  'Comente {K} para receber no Direct uma avaliação de perfil e descobrir quais caminhos de imigração combinam com sua formação, profissão, experiência e família.',
  'Quer entender quais caminhos podem fazer sentido para o seu perfil? Comente {K} e receba a avaliação no Direct.',
  'Se você quer avaliar seu perfil antes de decidir, comente {K} e receba a análise no Direct.',
  'Comente {K} e receba no Direct uma leitura do seu perfil: formação, profissão, experiência e família.',
];

/**
 * Nem todo post vende.
 *
 * Um perfil que pede comentário em dez posts por dia cansa, e o leitor
 * aprende a rolar. A proporção não é sorteada: ela é derivada da posição do
 * post no dia, então é estável, auditável e distribuída. Um em cada quatro
 * sai sem CTA, e são os de conteúdo puro.
 */
export function levaCta(posicao: number, proporcao = 0.75): boolean {
  if (proporcao >= 1) return true;
  if (proporcao <= 0) return false;
  const aCada = Math.round(1 / (1 - proporcao));
  return posicao % aCada !== 0;
}

export function ctaDaPosicao(posicao: number, keyword: string): string {
  const forma = FORMAS_DE_CTA[posicao % FORMAS_DE_CTA.length];
  return forma.replace(/\{K\}/g, keyword);
}

export function montarSystemDaCopy(marca: MarcaSocial): string {
  return `
Você escreve um POST DE IMAGEM ÚNICA para o Instagram da marca "${marca.nome}".

NICHO:
${marca.nicho}

BRIEFING (vale sobre qualquer regra genérica abaixo):
${marca.extra}

REGRA QUE VALE SOBRE TODAS: você só pode afirmar o que está no PACOTE FACTUAL. Ele é a lista do que a matéria diz. Número, prazo, taxa, nome e data que não estiverem lá não existem. Não deduza, não arredonde, não complete, não use o que você sabe do assunto.

CANAL: isto é Instagram, não newsletter. O perfil publica várias vezes por dia, então NÃO existe despedida. Proibido "Até amanhã", "Nos vemos amanhã", "Equipe ${marca.nome}", "Boa leitura" e qualquer assinatura de e-mail.

headline: a manchete da arte. De 3 a 10 palavras. Ela dá o FATO, não um teaser.
- Nada de clickbait, nada de pergunta retórica, nada de "você não vai acreditar".
- Não transforme possibilidade em certeza: "pode mudar" não vira "muda", "proposta avançou" não vira "aprovado".
- Não inverta a decisão: quem suspendeu não aprovou.
- Não invente consequência: se a matéria não diz o efeito, a manchete não afirma efeito.

destaque: de 1 a 4 palavras copiadas LITERALMENTE de dentro do headline, mesma grafia. É o pedaço que sai em cor. Sem nada óbvio para destacar, devolva vazio.

gancho: a primeira linha da legenda, antes do "mais". Continua a manchete, não a repete.

fato_principal: o que aconteceu, em duas frases no máximo.

contexto: por que isso importa para quem planeja se mudar. Sem futurologia.

informacao_util: o que a pessoa faz com essa informação. Prazo, requisito ou passo, SE estiverem no pacote. Vazio é melhor que inventado.

ressalva: só quando calar seria enganoso. Use as lacunas do pacote. Não escreva "a fonte não detalha" em todo post: isso vira tique.

hashtags: de 4 a 7, específicas DESTA pauta.

ESTRUTURA DA LEGENDA, nesta ordem: gancho, fato principal, contexto, informação útil, ressalva quando necessária.

Devolva JSON:
{"headline":"...","destaque":"...","gancho":"...","fato_principal":"...","contexto":"...","informacao_util":"...","ressalva":"...","cta":"","hashtags":["..."]}
`;
}

function montarUser(pauta: PautaAvaliada, pacote: PacoteFactual | null): string {
  const p = pauta.grupo.primary;

  const partes = [
    `TÍTULO DA MATÉRIA: ${p.title}`,
    `FONTE: ${p.source_name}`,
    `PAÍS: ${pauta.classificacao.pais}`,
    `EIXO: ${pauta.classificacao.eixo}`,
  ];

  if (pacote) {
    partes.push(
      "",
      "PACOTE FACTUAL, e nada fora dele pode ser afirmado:",
      JSON.stringify(
        {
          fatos: pacote.verified_facts,
          pessoas: pacote.people,
          organizacoes: pacote.organizations,
          lugares: pacote.places,
          datas: pacote.dates,
          numeros: pacote.numbers,
          lacunas: pacote.gaps,
        },
        null,
        2,
      ),
    );
  } else {
    partes.push("", "TEXTO DA MATÉRIA:", (pauta.enriquecimento?.texto ?? "").slice(0, 3000));
  }

  return partes.join("\n");
}

export type ResultadoDaCopy = {
  copy: CopyDoPost;
  tokens: number;
  custoUsd: number;
};

export async function gerarCopyDoPost(
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: { posicao?: number; env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<ResultadoDaCopy> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDaCopy(marca) },
      { role: "user", content: montarUser(pauta, pacote) },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const copy = CopyDoPostSchema.parse(limparVicios(data));

  /*
   * O CTA é montado aqui, não pedido ao modelo.
   *
   * Deixar o modelo escrever a promessa é onde nasce "descubra se você pode
   * morar legalmente nos EUA", que promete uma resposta que só um advogado dá
   * depois de ver o caso. A ação é sempre a mesma e a forma varia por posição,
   * o que dá variedade sem abrir espaço para promessa nova.
   */
  copy.cta = levaCta(posicao) ? ctaDaPosicao(posicao, marca.keyword) : "";

  return { copy, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}

/**
 * Monta a legenda na ordem, sem CTA e sem hashtags.
 *
 * As duas últimas partes ficam com `garantirLegendaSocial`, que é a camada que
 * decide posição e conteúdo delas. Montar aqui e lá produziria CTA duplicado,
 * que foi exatamente um dos defeitos que a guarda existe para pegar.
 */
export function montarLegenda(copy: CopyDoPost): string {
  return [copy.gancho, copy.fato_principal, copy.contexto, copy.informacao_util, copy.ressalva]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}
