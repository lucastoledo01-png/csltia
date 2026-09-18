import { callOpenAIVisionJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import type { AssetVisual } from "./tipos";

/**
 * A última barreira antes da imagem virar peça: alguém OLHA a foto.
 *
 * Todas as barreiras anteriores leem texto. A relevância compara o nome da
 * entidade com o nome do arquivo, a temporalidade compara a data, e o
 * `semanticContextFit` compara polaridade de palavra. Nenhuma delas abre a
 * imagem, e por isso nenhuma delas conseguia dizer que a foto de um prédio com
 * letreiro em cirílico não ilustra o Departamento do Trabalho americano.
 *
 * Foi assim que, em 17/09/2026, um post sobre o programa PERM foi para a fila
 * com a Escola Superior de Economia da cidade de Perm, na Rússia, e o registro
 * gravou `semanticContextFit: 100`, a nota máxima. O 100 não era aprovação: era
 * o valor padrão de quando o detector de polaridade fica calado.
 *
 * O que muda aqui é a natureza da pergunta. As outras barreiras perguntam "há
 * indício de que esteja errado?" e aprovam no silêncio. Esta pergunta "o que
 * você VÊ, e isso sustenta esta manchete?" e recusa no silêncio.
 */

/** Quanto tempo esperar por uma conferência. Curto: há candidata seguinte. */
const TEMPO_LIMITE_MS = 45_000;

export type VeredictoVisual = {
  /** A imagem pode ilustrar esta pauta. */
  aprovada: boolean;
  /** O que o modelo diz estar vendo. Vai para o relatório, não para a peça. */
  descricao: string;
  /** Por que passou ou por que não passou. */
  motivo: string;
  /**
   * País que a cena aparenta, quando dá para afirmar. `null` quando a imagem
   * não carrega pista geográfica, que é o caso da maioria das fotos de apoio.
   */
  paisAparente: string | null;
  /** 0 a 100. Abaixo do piso a imagem é recusada mesmo com `aprovada` true. */
  confianca: number;
  /** A conferência não pôde ser feita (sem chave, erro de rede, resposta ruim). */
  falhou: boolean;
};

export type PautaParaConferencia = {
  titulo: string;
  resumo?: string;
  eixo?: string;
};

export type OpcoesDeConferencia = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  modelo?: string;
  /** Piso de confiança para aceitar. Padrão 70. */
  pisoDeConfianca?: number;
};

/**
 * O piso é alto de propósito.
 *
 * Recusar imagem boa custa uma bandeira americana no lugar dela, que é peça
 * publicável e honesta. Aprovar imagem errada custa um post no ar afirmando
 * visualmente uma coisa que não aconteceu, num perfil que publica sozinho. Os
 * dois erros não têm o mesmo preço, e o piso reflete isso.
 */
const PISO_PADRAO = 70;

const SISTEMA = `Você confere se uma fotografia pode ilustrar uma notícia.

A publicação é brasileira, escreve em português e cobre os Estados Unidos.

Você recebe a manchete e a foto. Descreva o que está NA FOTO e decida se ela
pode acompanhar essa manchete sem enganar o leitor.

RECUSE quando:
- A cena é claramente de outro país, e a pauta é sobre os Estados Unidos. Placa,
  letreiro, alfabeto, bandeira, arquitetura e marca de carro são pistas. Texto em
  cirílico, árabe, chinês ou em qualquer língua que não seja inglês ou português
  é recusa direta em pauta americana.
- A foto registra um acontecimento específico que não é o desta pauta.
- A foto mostra uma pessoa identificável que não é citada na manchete. Rosto
  reconhecível, retrato, close de alguém: recusa. Gente pequena, de costas ou
  ao fundo, compondo a cena de uma rua ou de um prédio, pode ficar.
- A foto tem TEXTO legível como assunto: placa, cartaz, faixa, manchete de
  jornal, tela com texto, letreiro de loja. A peça já leva a manchete escrita
  por cima, e duas camadas de texto brigam. Letra pequena e incidental na
  paisagem, que ninguém lê, não é motivo de recusa.
- A foto é de um assunto homônimo: o nome bate, a coisa não. Uma cidade chamada
  como um programa de governo, uma empresa com a sigla de uma agência.
- A imagem não tem relação reconhecível com o assunto, mesmo sendo bonita.

APROVE quando:
- A foto mostra a pessoa, o órgão, o prédio, o lugar ou o objeto de que a pauta
  trata.
- A foto é uma cena de apoio honesta e do país certo: a fachada de um tribunal
  numa pauta de decisão judicial, uma rua americana numa pauta de custo de vida,
  documentos sobre uma mesa numa pauta de formulário. Apoio genérico não é
  defeito, desde que não afirme nada falso.

Na dúvida, recuse. Existe uma imagem de reserva, e ela é melhor que uma errada.

Responda só com JSON:
{
  "descricao": "o que você vê, em uma frase, em português",
  "paisAparente": "país que a cena aparenta, ou null se não der para dizer",
  "aprovada": true ou false,
  "motivo": "uma frase em português dizendo por quê",
  "confianca": número de 0 a 100
}`;

type RespostaDoModelo = {
  descricao?: unknown;
  paisAparente?: unknown;
  aprovada?: unknown;
  motivo?: unknown;
  confianca?: unknown;
};

function texto(valor: unknown, padrao = ""): string {
  return typeof valor === "string" ? valor.trim() : padrao;
}

/**
 * A recusa por falha é deliberada.
 *
 * Sem chave, com a rede fora ou com resposta ilegível, a resposta correta não é
 * "deixa passar". O perfil publica sem ninguém olhando, e a alternativa à
 * imagem não conferida é a bandeira, que nunca está errada. Falha vira recusa,
 * e o motivo fica gravado para o relatório distinguir "recusada porque estava
 * errada" de "recusada porque não deu para conferir".
 */
function naoDeuParaConferir(motivo: string): VeredictoVisual {
  return {
    aprovada: false,
    descricao: "",
    motivo,
    paisAparente: null,
    confianca: 0,
    falhou: true,
  };
}

export async function conferirImagem(
  asset: Pick<AssetVisual, "imageUrl" | "sourceAssetId" | "imageContextType">,
  pauta: PautaParaConferencia,
  opcoes: OpcoesDeConferencia = {},
): Promise<VeredictoVisual> {
  const env = opcoes.env ?? process.env;
  const config = getAIProviderConfig(env);
  if (!config.isConfigured) return naoDeuParaConferir("sem credencial de modelo para conferir a imagem");

  const url = (asset.imageUrl ?? "").trim();
  if (!url.startsWith("http")) return naoDeuParaConferir("imagem sem URL pública para conferir");

  const piso = opcoes.pisoDeConfianca ?? PISO_PADRAO;
  const modelo = opcoes.modelo || env.OPENAI_MODEL_VISUAL || config.triageModel;

  const descricaoDaPauta = [
    `MANCHETE: ${pauta.titulo}`,
    pauta.resumo ? `RESUMO: ${pauta.resumo}` : "",
    pauta.eixo ? `EDITORIA: ${pauta.eixo}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mensagens = [
    { role: "system" as const, content: SISTEMA },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: descricaoDaPauta },
        { type: "image_url" as const, image_url: { url } },
      ],
    },
  ];

  const chamar = (amostragem: { temperature?: number }) =>
    callOpenAIVisionJSON<RespostaDoModelo>(
      mensagens,
      modelo,
      env,
      opcoes.fetcher ?? fetch,
      amostragem,
      TEMPO_LIMITE_MS,
    );

  let resposta: RespostaDoModelo;
  try {
    /*
     * Temperatura zero porque isto é julgamento, não redação. A mesma foto na
     * mesma pauta tem que dar o mesmo veredicto nas duas vezes: um portão que
     * muda de opinião não é portão.
     *
     * Nem toda família de modelo aceita. O `gpt-5.6-luna`, que é o que está
     * configurado em produção, responde 400 dizendo que só o valor padrão vale.
     * Quando isso acontece a chamada é refeita sem o parâmetro, porque a
     * alternativa seria recusar toda imagem por causa de um parâmetro de
     * amostragem, e foi exatamente o que aconteceu na primeira medição contra
     * a API real: quatro de quatro recusadas por 400, inclusive as boas.
     */
    let dados;
    try {
      dados = await chamar({ temperature: 0 });
    } catch (erro) {
      if (!/temperature/i.test((erro as Error).message)) throw erro;
      dados = await chamar({});
    }
    resposta = dados.data;
  } catch (erro) {
    return naoDeuParaConferir(`conferência visual falhou: ${(erro as Error).message}`);
  }

  const confianca = Number(resposta.confianca);
  const descricao = texto(resposta.descricao);
  const motivo = texto(resposta.motivo, "sem motivo declarado");
  const paisBruto = texto(resposta.paisAparente);
  const paisAparente = paisBruto && paisBruto.toLowerCase() !== "null" ? paisBruto : null;

  if (typeof resposta.aprovada !== "boolean" || !Number.isFinite(confianca)) {
    return naoDeuParaConferir("conferência visual devolveu resposta em formato inesperado");
  }

  /*
   * Aprovação com confiança baixa é recusa.
   *
   * O modelo às vezes aprova dizendo "provavelmente serve". Provavelmente não
   * é critério para um perfil que publica sozinho.
   */
  const aprovada = resposta.aprovada && confianca >= piso;

  return {
    aprovada,
    descricao,
    motivo: aprovada
      ? motivo
      : resposta.aprovada
        ? `${motivo} (confiança ${Math.round(confianca)}, abaixo do piso ${piso})`
        : motivo,
    paisAparente,
    confianca: Math.max(0, Math.min(100, Math.round(confianca))),
    falhou: false,
  };
}
