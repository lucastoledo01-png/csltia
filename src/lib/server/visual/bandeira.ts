import type { AssetVisual } from "./tipos";

/**
 * O último recurso, e ele tem bandeira.
 *
 * A regra vem do dono, em 17/09/2026, depois de um post sair como peça de
 * texto puro: **nenhuma peça fica sem foto**. Quando não há foto da entidade e
 * nem o banco conceitual entrega nada, entra uma imagem que não é da pauta mas
 * é da PUBLICAÇÃO: bandeira americana em fachada, em janela, na rua, em Wall
 * Street.
 *
 * Por que isso não contradiz a regra de nunca usar imagem genérica. Genérica é
 * a foto que finge ser da pauta: um céu estrelado embaixo de uma manchete
 * sobre Boston. A bandeira não finge nada. Ela diz "Estados Unidos", que é o
 * assunto de toda edição desta publicação, e é a mesma coisa que um jornal faz
 * quando estampa a própria marca na capa de um dia sem foto.
 *
 * Três exigências que cada imagem daqui cumpre:
 *
 * 1. **Identidade inconfundível.** Bandeira visível e grande. Não é paisagem
 *    bonita dos EUA, é a bandeira.
 * 2. **Licença livre, conferida no Commons item a item**, com autor e link
 *    para a peça imprimir o crédito.
 * 3. **Sem pessoa reconhecível em primeiro plano.** Rosto numa imagem de
 *    último recurso vira personagem de uma pauta que não é dele.
 */

type Bandeira = {
  /** Identificador estável, usado para não repetir a mesma duas vezes seguidas. */
  id: string;
  /** Em que tipo de pauta ela cai melhor. Serve à escolha, nunca a bloqueia. */
  afinidade: string[];
  asset: AssetVisual;
};

function daCommons(entrada: {
  id: string;
  arquivo: string;
  url: string;
  pagina: string;
  autor: string;
  licenca: string;
  licencaUrl: string;
  largura: number;
  altura: number;
  descricao: string;
  afinidade: string[];
}): Bandeira {
  return {
    id: entrada.id,
    afinidade: entrada.afinidade,
    asset: {
      entityName: "Estados Unidos",
      entityNormalized: "estados unidos",
      entityType: "place",
      source: "wikimedia_commons",
      sourceAssetId: entrada.arquivo,
      imageUrl: entrada.url,
      sourcePageUrl: entrada.pagina,
      author: entrada.autor,
      license: entrada.licenca,
      licenseUrl: entrada.licencaUrl,
      attribution: `${entrada.autor}, ${entrada.licenca}, via Wikimedia Commons`,
      rightsStatement: `Licença livre conferida no Commons: ${entrada.licenca}`,
      rightsStatus: "verified",
      rightsCheckedAt: "2026-09-17T02:00:00.000Z",
      sourceLastCheckedAt: "2026-09-17T02:00:00.000Z",
      width: entrada.largura,
      height: entrada.altura,
      mimeType: "image/jpeg",
      storagePath: null,
      perceptualHash: null,
      imageRelevanceScore: 0,
      /*
       * `place` e não `conceptual`, e a diferença não é cosmética: a bolha da
       * capa recusa imagem conceitual, e é assim que o círculo continua sendo
       * só para foto com identidade. A bandeira entra como fundo, nunca como
       * bolha.
       */
      imageContextType: "place",
      metadata: { descricao: entrada.descricao, ultimoRecurso: true },
    },
  };
}

/**
 * As quatro. Poucas de propósito: cada uma precisa ser olhada antes de entrar,
 * e um banco grande de imagens que ninguém conferiu é o problema que este
 * arquivo existe para resolver, não uma versão melhor dele.
 */
export const BANDEIRAS: Bandeira[] = [
  daCommons({
    id: "nyse-bandeira-gigante",
    arquivo: "New York City (New York, USA), Wall Street -- 2012 -- 6614.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/d/db/New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg",
    pagina: "https://commons.wikimedia.org/wiki/File:New_York_City_(New_York,_USA),_Wall_Street_--_2012_--_6614.jpg",
    autor: "Dietmar Rabich",
    licenca: "CC BY-SA 4.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    largura: 4447,
    altura: 3456,
    descricao: "Bandeira americana gigante na fachada da Bolsa de Nova York, em Wall Street",
    afinidade: ["economia", "trabalho", "politica"],
  }),
  daCommons({
    id: "saks-fileira-de-bandeiras",
    arquivo: "Saks Fifth Flags (50107918056).jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Saks_Fifth_Flags_%2850107918056%29.jpg",
    pagina: "https://commons.wikimedia.org/wiki/File:Saks_Fifth_Flags_(50107918056).jpg",
    autor: "Eden, Janine and Jim",
    licenca: "CC BY 2.0",
    licencaUrl: "https://creativecommons.org/licenses/by/2.0/",
    largura: 4608,
    altura: 3456,
    descricao: "Fileira de bandeiras americanas nas janelas de um prédio na Quinta Avenida",
    afinidade: ["custo_de_vida", "cultura", "economia"],
  }),
  daCommons({
    id: "main-street-bandeira",
    arquivo: "American Flag on Main Street, Starbuck, Minnesota (37151128064).jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c5/American_Flag_on_Main_Street%2C_Starbuck%2C_Minnesota_%2837151128064%29.jpg",
    pagina: "https://commons.wikimedia.org/wiki/File:American_Flag_on_Main_Street,_Starbuck,_Minnesota_(37151128064).jpg",
    autor: "Tony Webster",
    licenca: "CC BY-SA 2.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    largura: 5674,
    altura: 3849,
    descricao: "Bandeira americana na esquina da Main Street, contra o céu azul",
    afinidade: ["cultura", "seguranca", "custo_de_vida", "brasil", "imigracao"],
  }),
  daCommons({
    id: "nyse-colunas",
    arquivo: "New York Stock Exchange Building 2010.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c8/New_York_Stock_Exchange_Building_2010.jpg",
    pagina: "https://commons.wikimedia.org/wiki/File:New_York_Stock_Exchange_Building_2010.jpg",
    autor: "LeoTar",
    licenca: "CC BY-SA 3.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    largura: 2592,
    altura: 1944,
    descricao: "Colunas da Bolsa de Nova York com três bandeiras americanas",
    afinidade: ["politica", "economia", "tecnologia"],
  }),
];

/**
 * Qual bandeira entra.
 *
 * Prefere a que combina com o eixo da pauta, e entre as que combinam prefere a
 * que NÃO saiu recentemente. Se todas saíram, entra a mais antiga da lista:
 * repetir bandeira é melhor do que publicar peça sem foto, que é a regra que
 * este arquivo existe para cumprir.
 */
export function escolherBandeira(opcoes: { eixo?: string; evitar?: Set<string> } = {}): AssetVisual {
  const evitar = opcoes.evitar ?? new Set<string>();
  const eixo = (opcoes.eixo ?? "").trim();

  const naoUsadas = BANDEIRAS.filter((b) => !evitar.has(b.asset.imageUrl));
  const pool = naoUsadas.length > 0 ? naoUsadas : BANDEIRAS;

  const porEixo = eixo ? pool.filter((b) => b.afinidade.includes(eixo)) : [];
  const escolhida = porEixo[0] ?? pool[0];

  return { ...escolhida.asset };
}

/** A imagem veio do último recurso? Usado pelo relatório e pelos testes. */
export function ehUltimoRecurso(asset: AssetVisual | null | undefined): boolean {
  return Boolean(asset?.metadata?.ultimoRecurso);
}
