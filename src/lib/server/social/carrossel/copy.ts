/**
 * O texto de um carrossel: a mesma legenda de sempre, mais os slides.
 *
 * A decisão que organiza este módulo é reaproveitar `CopyDoPostSchema` inteiro
 * em vez de criar um contrato paralelo. A manchete e a legenda de um carrossel
 * têm exatamente o mesmo trabalho que num post de imagem única, e as duas
 * verificações mais importantes do Social Guard, a ancoragem da manchete e a
 * ancoragem da legenda, já operam sobre esses campos. Um contrato novo faria
 * essas duas verificações precisarem de um segundo caminho, e caminho duplicado
 * de guarda é como uma regra deixa de valer sem ninguém perceber.
 *
 * O que muda é o que vai NA legenda. Num carrossel o detalhe vive nos slides, e
 * repetir tudo na legenda é pedir para o leitor não deslizar.
 */

import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../../newsroom/ai-provider";
import { limparVicios } from "../../newsroom/anti-vicios";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { PautaAvaliada } from "../../editorial/guarda";
import { CopyDoPostSchema, ctaDaPosicao, levaCta, type MarcaSocial } from "../copy";
import { papeisDoModelo, papeisPara, type EstruturaDoCarrossel, type PapelDeSlide } from "./estrutura";

/**
 * Corta na última palavra inteira que cabe.
 *
 * Mesmo aparador da copy de imagem única, e pela mesma razão: estouro de teto
 * não pode custar o post. A diferença é o que os tetos significam aqui, que é
 * densidade de slide e não tamanho de campo. Ver DENSIDADE abaixo.
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
 * DENSIDADE: quanto de texto cabe confortavelmente num slide.
 *
 * Não são números de gosto. O canvas é 1080x1440 e o corpo tem uma faixa útil
 * de mais ou menos 900 por 700 pontos depois do cabeçalho, do rodapé e das
 * margens. O ajuste automático do render encolhe o texto até um piso e o piso
 * existe porque abaixo dele a peça fica ilegível no celular, e a regra do
 * pedido é explícita: se não cabe, reduzir informação ou acrescentar slide,
 * nunca diminuir a fonte até ficar ruim.
 *
 * Então o teto de caracteres é o que faz o texto caber ANTES de o ajuste
 * precisar encolher nada.
 */
const TITULO_DO_SLIDE = 70;
const CORPO_DO_SLIDE = 260;
const BULLET_DO_SLIDE = 90;
const MAXIMO_DE_BULLETS = 3;
const LADO_DA_COMPARACAO = 120;

export const SlideDeTextoSchema = z.object({
  /**
   * O papel que este slide cumpre, ecoado de volta pelo modelo.
   *
   * Serve para amarrar a resposta à estrutura pedida: sem isso, a única forma
   * de saber qual slide é qual seria a posição no array, e um modelo que
   * inverte dois slides produziria um carrossel que responde antes de
   * perguntar, sem nada que detectasse isso.
   */
  papel: z.string().min(1),
  titulo: aparar(TITULO_DO_SLIDE).pipe(z.string().min(3)),
  corpo: aparar(CORPO_DO_SLIDE).pipe(z.string()).default(""),
  bullets: z.array(aparar(BULLET_DO_SLIDE).pipe(z.string())).max(MAXIMO_DE_BULLETS).default([]),
  /** Só na comparação: o que vale de cada lado. Vazio nos outros papéis. */
  lado_a: aparar(LADO_DA_COMPARACAO).pipe(z.string()).default(""),
  lado_b: aparar(LADO_DA_COMPARACAO).pipe(z.string()).default(""),
});

export type SlideDeTexto = z.infer<typeof SlideDeTextoSchema>;

export const CopyDoCarrosselSchema = CopyDoPostSchema.extend({
  slides: z.array(SlideDeTextoSchema).min(1).max(7),
});

export type CopyDoCarrossel = z.infer<typeof CopyDoCarrosselSchema>;

/**
 * A legenda do carrossel é mais curta, e isso é garantido em código.
 *
 * `contexto` e `informacao_util` são o material dos slides, e repeti-los na
 * legenda faz o post entregar tudo antes do primeiro deslize. O prompt já pede
 * os dois vazios, e aqui eles são esvaziados de novo.
 *
 * Não é redundância: é o que torna `montarLegenda`, a função que a guarda e o
 * pipeline já usam, PROVADAMENTE igual à legenda curta do carrossel. A
 * alternativa era uma segunda função de legenda, e aí a guarda ancoraria um
 * texto e o post publicaria outro.
 */
export function encurtarLegenda(copy: CopyDoCarrossel): void {
  copy.contexto = "";
  copy.informacao_util = "";
}

function descreverPapeis(papeis: PapelDeSlide[]): string {
  return papeis
    .map((p, i) => {
      const n = i + 1;
      if (p.escritoEmCodigo) {
        return `${n}. papel "${p.papel}": NÃO escreva este slide. Ele é montado em código. Não inclua no array.`;
      }
      const extra = p.variante === "comparacaoDuasColunas"
        ? ' Este slide tem DUAS COLUNAS: preencha "lado_a" e "lado_b" com o que vale de cada lado, e use "titulo" para nomear a diferença. Deixe "corpo" vazio.'
        : "";
      return `${n}. papel "${p.papel}": ${p.pede}.${extra}`;
    })
    .join("\n");
}

function montarSystemDoCarrossel(
  marca: MarcaSocial,
  estrutura: EstruturaDoCarrossel,
  papeis: PapelDeSlide[],
): string {
  const paraEscrever = papeisDoModelo(papeis);

  return `
Você escreve um CARROSSEL do Instagram para a marca "${marca.nome}", no formato ${estrutura}.

NICHO:
${marca.nicho}

BRIEFING (vale sobre qualquer regra genérica abaixo):
${marca.extra}

REGRA QUE VALE SOBRE TODAS: você só pode afirmar o que está no PACOTE FACTUAL. Ele é a lista do que a fonte oficial diz. Número, prazo, taxa, nome, formulário e data que não estiverem lá não existem. Não deduza, não arredonde, não complete, não use o que você sabe do assunto. Isso vale para CADA slide, um por um: um slide sem lastro no pacote derruba o carrossel inteiro.

CANAL: isto é Instagram, não newsletter. NÃO existe despedida. Proibido "Até amanhã", "Equipe ${marca.nome}", "Boa leitura" e qualquer assinatura de e-mail.

QUEM LÊ: uma pessoa que quer morar nos Estados Unidos, não um advogado. Escreva como se explicasse para alguém inteligente que nunca leu um formulário de imigração. Termo técnico só quando não há palavra comum, e aí explicado na mesma frase em que aparece. Nada de "beneficiário", "peticionário" e "adjudicação" soltos.

OS SLIDES, nesta ordem exata (${paraEscrever.length} slides para você escrever):
${descreverPapeis(papeis)}

COMO ESCREVER CADA SLIDE:
- Uma ideia central por slide. Se duas ideias disputam o mesmo slide, escolha a que responde o papel dele.
- titulo: até ${TITULO_DO_SLIDE} caracteres. É o que a pessoa lê primeiro, grande na imagem.
- corpo: até ${CORPO_DO_SLIDE} caracteres, em no máximo três frases curtas. Escaneável, não parágrafo de artigo.
- bullets: até ${MAXIMO_DE_BULLETS} itens de até ${BULLET_DO_SLIDE} caracteres, só quando a informação é naturalmente uma lista. Preencha corpo OU bullets, não os dois cheios.
- Nada de linguagem jurídica, nada de lista enorme, nada de citação de regulamento.

O SLIDE 1 É O ÚNICO QUE APARECE NO FEED de quem não deslizou. Ele precisa funcionar sozinho: curto, humano, claro, interessante, compreensível para quem não é advogado, e ancorado no pacote. Não é teaser: ele já diz do que se trata.

A LEGENDA não repete o carrossel. O detalhe está nos slides. A legenda tem gancho, resumo, ressalva quando necessária, e nada mais.

headline: a manchete do slide 1. De 3 a 10 palavras, afirmando o fato.
destaque: de 1 a 4 palavras copiadas LITERALMENTE do headline. Vazio se não houver nada óbvio.
gancho: a primeira linha da legenda. Continua a manchete, não a repete.
fato_principal: o resumo do carrossel em duas frases no máximo.
contexto: deixe VAZIO. No carrossel, contexto é slide.
informacao_util: deixe VAZIO. No carrossel, isso é slide.
ressalva: só quando calar seria enganoso. Use as lacunas do pacote.
cta: deixe VAZIO. O CTA é montado em código.
hashtags: de 4 a 7, específicas DESTE assunto.

Devolva JSON:
{"headline":"...","destaque":"...","gancho":"...","fato_principal":"...","contexto":"","informacao_util":"","ressalva":"...","cta":"","hashtags":["..."],"slides":[{"papel":"...","titulo":"...","corpo":"...","bullets":[],"lado_a":"","lado_b":""}]}
`;
}

function montarUserDoCarrossel(pauta: PautaAvaliada, pacote: PacoteFactual | null): string {
  const p = pauta.grupo.primary;

  const partes = [
    `ASSUNTO: ${p.title}`,
    `FONTE OFICIAL: ${p.source_name}`,
    `EIXO: ${pauta.classificacao.eixo}`,
  ];

  if (pacote) {
    partes.push(
      "",
      "PACOTE FACTUAL, e nada fora dele pode ser afirmado em nenhum slide:",
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
    partes.push("", "TEXTO DA FONTE:", (pauta.enriquecimento?.texto ?? "").slice(0, 3000));
  }

  return partes.join("\n");
}

export type ResultadoDoCarrossel = {
  copy: CopyDoCarrossel;
  tokens: number;
  custoUsd: number;
};

export type OpcoesDoCarrossel = {
  estrutura: EstruturaDoCarrossel;
  slides: number;
  posicao?: number;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

/**
 * Ajusta a resposta do modelo à estrutura pedida, sem inventar slide.
 *
 * Aparar para baixo é seguro porque a ordem é significativa e os papéis vêm
 * na ordem da estrutura. Para CIMA não há conserto determinístico: escrever um
 * slide que o modelo não escreveu é publicar texto que ninguém redigiu, e é
 * exatamente a regra que o aparador do formato legado já registra.
 */
export function ajustarSlides(slides: SlideDeTexto[], papeis: PapelDeSlide[]): SlideDeTexto[] {
  return slides.slice(0, papeisDoModelo(papeis).length);
}

export async function gerarCopyDoCarrossel(
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: OpcoesDoCarrossel,
): Promise<ResultadoDoCarrossel> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;
  const comCta = levaCta(posicao) && Boolean(marca.keyword.trim());
  const papeis = papeisPara(opcoes.estrutura, opcoes.slides, comCta);

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoCarrossel(marca, opcoes.estrutura, papeis) },
      { role: "user", content: montarUserDoCarrossel(pauta, pacote) },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const copy = CopyDoCarrosselSchema.parse(limparVicios(data));
  copy.slides = ajustarSlides(copy.slides, papeis);
  encurtarLegenda(copy);

  /*
   * O CTA continua sendo montado em código, e agora isso importa mais.
   *
   * Num carrossel o CTA tem slide próprio, e um slide de fechamento escrito
   * pelo modelo seria a mesma promessa inventada de antes, agora em corpo 60
   * dentro da arte. A palavra vem da keyword canônica; sem automação escutando
   * não há CTA, e o carrossel simplesmente não tem slide de fechamento.
   */
  copy.cta = comCta ? ctaDaPosicao(posicao, marca.keyword) : "";

  return { copy, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}

/**
 * Reescreve o carrossel corrigindo o que a guarda apontou.
 *
 * Os problemas chegam nomeados e com o índice do slide, porque "o slide 3
 * afirma 540 dias e o pacote não tem esse número" produz correção, e "melhore
 * o carrossel" produz outro texto com outros defeitos.
 */
export async function repararCopyDoCarrossel(
  copy: CopyDoCarrossel,
  problemas: Array<{ motivo: string; detalhe: string }>,
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: OpcoesDoCarrossel,
): Promise<ResultadoDoCarrossel> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;
  const comCta = levaCta(posicao) && Boolean(marca.keyword.trim());
  const papeis = papeisPara(opcoes.estrutura, opcoes.slides, comCta);

  const lista = problemas.map((p, i) => `${i + 1}. [${p.motivo}] ${p.detalhe}`).join("\n");

  const instrucao = `
O carrossel abaixo foi recusado. Corrija APENAS os problemas listados e devolva o JSON inteiro.

PROBLEMAS A CORRIGIR:
${lista}

REGRAS DA CORREÇÃO:
- Não invente nada para tapar buraco. Se um número, prazo, formulário ou nome não está no pacote factual, REMOVA a frase inteira em vez de trocar por outro valor.
- Se um slide não tem lastro suficiente no pacote, ele pode ficar mais curto ou dizer menos. O que ele não pode é afirmar o que a fonte não diz.
- Não mexa no que não foi apontado. Slide que não tem problema fica exatamente como está, com o mesmo papel.
- Mantenha a ordem e a quantidade de slides.
- Não escreva despedida, assinatura nem "Até amanhã".
- Não prometa aprovação, elegibilidade, prazo ou custo.

CARROSSEL RECUSADO:
${JSON.stringify(copy, null, 2)}
`;

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoCarrossel(marca, opcoes.estrutura, papeis) },
      { role: "user", content: `${montarUserDoCarrossel(pauta, pacote)}

${instrucao}` },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const corrigida = CopyDoCarrosselSchema.parse(limparVicios(data));
  corrigida.slides = ajustarSlides(corrigida.slides, papeis);
  encurtarLegenda(corrigida);
  corrigida.cta = comCta ? ctaDaPosicao(posicao, marca.keyword) : "";

  return { copy: corrigida, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}
