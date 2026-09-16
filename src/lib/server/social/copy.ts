import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import { limparVicios } from "../newsroom/anti-vicios";
import { FORMA_DA_MANCHETE, REGRA_DA_MANCHETE } from "./manchete";

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

/**
 * Corta na última palavra inteira que cabe.
 *
 * Mesma razão do aparador da legenda da newsletter: o modelo estoura o teto
 * com frequência, e o custo disso não pode ser o post inteiro. Perder a cauda
 * de um parágrafo é muito melhor que perder a publicação, e foi assim que uma
 * pauta boa do Diversity Visa virou "falha técnica ao gerar" no primeiro
 * dry-run de ponta a ponta.
 *
 * A manchete NÃO é aparada em silêncio: cortar manchete muda o que ela afirma.
 * Ela vai inteira para a guarda, que reprova pela forma e manda reescrever.
 */
function aparar(limite: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string" || v.length <= limite) return v;
    const bruto = v.slice(0, limite);
    const ultimoEspaco = bruto.lastIndexOf(" ");
    return (ultimoEspaco > limite * 0.6 ? bruto.slice(0, ultimoEspaco) : bruto).trimEnd();
  }, z.string());
}

export const CopyDoPostSchema = z.object({
  /**
   * A manchete da arte. Curta porque ela é grande na imagem.
   *
   * O limite de palavras não é estética: a arte tem três linhas e um título
   * longo encolhe até ficar ilegível no celular.
   */
  /*
   * Sem teto aqui de propósito. Manchete longa é problema de forma, e quem
   * decide isso é a guarda, que sabe mandar reescrever. Aparar em silêncio
   * mudaria o que a manchete afirma.
   */
  headline: z.string().min(8),
  /** A expressão do headline que sai em cor. Copiada literalmente dele. */
  destaque: aparar(60).pipe(z.string()).default(""),
  gancho: aparar(160).pipe(z.string().min(10)),
  fato_principal: aparar(400).pipe(z.string().min(20)),
  contexto: aparar(400).pipe(z.string()).default(""),
  informacao_util: aparar(300).pipe(z.string()).default(""),
  /** O que a matéria NÃO diz, quando calar seria enganoso. */
  ressalva: aparar(240).pipe(z.string()).default(""),
  /**
   * Vazio de propósito.
   *
   * O prompt manda o modelo devolver string vazia aqui, porque o CTA é montado
   * em código: é onde mora a promessa, e promessa escrita por modelo vira
   * "descubra se você pode morar legalmente nos EUA". Um piso de tamanho neste
   * campo reprovaria a resposta correta.
   */
  cta: aparar(200).pipe(z.string()).default(""),
  /**
   * Sugestão, não decisão.
   *
   * O conjunto final é montado por `garantirLegendaSocial`, que filtra o que a
   * pauta não sustenta e completa o que falta. Exigir um mínimo aqui faria uma
   * resposta pobre em hashtag derrubar uma copy boa, quando a camada seguinte
   * resolveria sozinha.
   */
  hashtags: z.array(z.string()).max(12).default([]),
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

/**
 * Sem keyword, sem CTA. Nunca uma frase com o buraco no meio.
 *
 * Toda forma de CTA é construída em torno de "comente {K}". Com `keyword`
 * vazia, `replace` devolveria "Comente  para receber..." — uma frase que pede
 * uma ação impossível de executar. E uma palavra qualquer no lugar seria pior:
 * o listener escuta uma só, e "Comente VISA" com o listener em outra palavra
 * ensina o leitor que comentar não adianta.
 *
 * Quem decide qual é a palavra é `resolverKeywordCanonica`, e ela devolve vazio
 * quando não há automação escutando.
 */
export function ctaDaPosicao(posicao: number, keyword: string): string {
  if (!keyword.trim()) return "";
  const forma = FORMAS_DE_CTA[posicao % FORMAS_DE_CTA.length];
  return forma.replace(/\{K\}/g, keyword.trim());
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

${REGRA_DA_MANCHETE}

E, na manchete, as quatro que derrubam o post:
- Nada de clickbait, nada de pergunta retórica, nada de "você não vai acreditar".
- Não transforme possibilidade em certeza: "pode mudar" não vira "muda", "proposta avançou" não vira "aprovado".
- Não inverta a decisão: quem suspendeu não aprovou.
- Não invente consequência: se a matéria não diz o efeito, a manchete não afirma efeito.

destaque: de 1 a 4 palavras copiadas LITERALMENTE de dentro do headline, mesma grafia. É o pedaço que sai em cor. Sem nada óbvio para destacar, devolva vazio.

gancho: a primeira linha da legenda, antes do "mais". Continua a manchete, não a repete.

fato_principal: o que aconteceu, em duas frases no máximo.

contexto: por que isso importa para quem planeja se mudar. Sem futurologia.

informacao_util: o que a pessoa faz com essa informação. Prazo, requisito ou passo, SE estiverem no pacote. Vazio é melhor que inventado.

ressalva: quase sempre VAZIA. Ela só existe quando calar seria enganoso, e mesmo aí ela fala do FATO, nunca da reportagem.
- Proibido: "a fonte não informa", "a fonte não detalha", "não há detalhes", "o veículo não diz". Isso é confissão dentro do post, e vira tique: o leitor não quer saber o que a matéria deixou de apurar.
- Quando a falta É a notícia, escreva falando da divulgação: "a nova data ainda não foi divulgada".
- Na dúvida, deixe vazio. Post mais curto é melhor que post que explica o que não tem.

hashtags: de 4 a 7, específicas DESTA pauta.

VOZ DE REDE SOCIAL: aqui é feed, não é e-mail nem jornal.
- Frase curta. Uma ideia por linha. Se der para cortar uma palavra, corte.
- Fale com a pessoa: "se você está com F-1", "quem já protocolou". Isso é endereçamento, e é permitido.
- Comece pelo que aconteceu, nunca pelo nome de um órgão praticando ato.
- Palavra comum primeiro, sigla depois e só se ajudar. Nome oficial de norma e de processo em inglês não entra.
- Zero emoji, zero gíria. Leve não é frouxo, e o assunto é a vida de alguém.

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
 * Reescreve a copy corrigindo o que a guarda apontou.
 *
 * A reescrita recebe os problemas NOMEADOS, e não um pedido genérico de
 * melhorar. Um "reescreva melhor" produz outro texto com outros defeitos; um
 * "a manchete afirma 720 dias e a fonte diz 540" produz a correção.
 *
 * O pacote factual vai junto de novo, e é o ponto mais importante deste
 * prompt: reparar não pode virar uma segunda chance de inventar. O modelo
 * recebe a mesma restrição da primeira geração, mais a instrução explícita de
 * que remover é preferível a substituir por outra coisa.
 */
export async function repararCopyDoPost(
  copy: CopyDoPost,
  problemas: Array<{ motivo: string; detalhe: string }>,
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: { posicao?: number; env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<ResultadoDaCopy> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;

  const lista = problemas.map((p, i) => `${i + 1}. [${p.motivo}] ${p.detalhe}`).join("\n");

  const instrucao = `
O texto abaixo foi recusado. Corrija APENAS os problemas listados e devolva o JSON inteiro.

PROBLEMAS A CORRIGIR:
${lista}

REGRAS DA CORREÇÃO:
- Não invente nada para tapar buraco. Se um número, prazo ou nome não está no pacote factual, REMOVA a frase inteira em vez de trocar por outro valor.
- Não mexa no que não foi apontado. Frase que não tem problema fica como está.
- Manchete: de ${FORMA_DA_MANCHETE.minimoDePalavras} a ${FORMA_DA_MANCHETE.maximoDePalavras} palavras, afirmando o fato, sem pergunta e sem clickbait.
- Não escreva despedida, assinatura nem "Até amanhã".
- Não prometa aprovação, elegibilidade, prazo ou custo.

TEXTO RECUSADO:
${JSON.stringify(copy, null, 2)}
`;

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDaCopy(marca) },
      { role: "user", content: `${montarUser(pauta, pacote)}

${instrucao}` },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const corrigida = CopyDoPostSchema.parse(limparVicios(data));
  corrigida.cta = levaCta(posicao) ? ctaDaPosicao(posicao, marca.keyword) : "";

  return { copy: corrigida, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
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
