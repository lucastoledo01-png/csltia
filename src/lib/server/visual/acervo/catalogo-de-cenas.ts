/**
 * O cardápio de cenas do acervo próprio.
 *
 * Decidido pelo dono em 29/09/2026: a busca no acervo é por TAG, e quem
 * escolhe a tag é o modelo que já lê a matéria em `cena-da-pauta.ts`,
 * escolhendo de uma lista FECHADA. Modelo escolhendo de cardápio é confiável;
 * lista de palavras adivinhando pelo título não é, e foi assim que "ice" casou
 * dentro de "justice" e "imovel" não casou com "imoveis".
 *
 * A tag tem a forma `grupo/assunto`, e são exatamente os dois primeiros campos
 * de conteúdo do nome do arquivo (`grupo-pais-assunto-detalhe-numero.jpg`). É
 * isso que torna a ingestão um formulário que ninguém preenche: o designer
 * nomeia o arquivo e a linha nasce com a tag certa.
 *
 * DE ONDE VEIO ESTA LISTA (05/10/2026). O guia do designer, com as 746 cenas
 * em 40 grupos, não está no repositório. Esta lista foi derivada das editorias
 * do portal (Economia, Trabalho, Tecnologia, Custo de vida, Política, Brasil),
 * da distribuição das 396 pautas aprovadas em 45 dias (tecnologia 31%,
 * economia 16%, política 16%, custo de vida 14%, Brasil 10%) e dos grupos que
 * a decisão de 29/09 cita pelo nome (`religiao`, `militar`). Quando o guia
 * chegar, ESTE é o arquivo a trocar, e o teste de forma garante que nenhum
 * nome novo quebre o separador do arquivo.
 *
 * Regras de forma, todas cobradas em teste:
 *   - grupo e assunto em minúsculas ASCII, palavras ligadas por "_";
 *   - nunca hífen, porque o hífen é o separador dos campos do nome;
 *   - nenhum assunto pede pessoa identificável nem texto na imagem, as duas
 *     proibições do dono de 18/09/2026.
 */

export const CATALOGO_DE_CENAS = {
  tecnologia: ["chip", "smartphone", "notebook", "servidor", "cabo_fibra", "laboratorio"],
  inteligencia_artificial: ["datacenter", "gpu", "robo", "circuito"],
  espaco: ["foguete", "lancamento", "estacao_espacial", "telescopio"],
  carros: ["carro_eletrico", "carregador", "carro_autonomo", "fabrica_automoveis", "concessionaria"],
  energia: ["painel_solar", "turbina_eolica", "usina", "linha_transmissao", "plataforma_petroleo"],
  mercado_financeiro: ["bolsa_valores", "wall_street", "banco_fachada", "caixa_eletronico"],
  dinheiro: ["notas_dolar", "moedas", "cartao_credito", "carteira"],
  economia: ["porto_conteineres", "navio_cargueiro", "fabrica", "armazem", "banco_central"],
  comercio: ["supermercado_prateleira", "carrinho_compras", "shopping", "loja_fachada", "feira"],
  custo_de_vida: ["bomba_gasolina", "cesta_alimentos", "sacola_compras", "mesa_cafe", "conta_restaurante"],
  moradia: ["rua_residencial", "casa_suburbio", "predio_apartamentos", "canteiro_obras", "chaves_casa"],
  trabalho: ["escritorio", "home_office", "sala_reuniao", "linha_producao", "uniforme_trabalho"],
  educacao: ["campus_universitario", "sala_aula", "biblioteca", "capelo_formatura", "livros"],
  saude: ["hospital_fachada", "consultorio", "remedios", "seringa", "ambulancia", "farmacia"],
  politica_eua: ["capitolio", "casa_branca", "suprema_corte", "plenario", "urna_votacao", "bandeira_eua"],
  governo_eua: ["predio_federal", "departamento_estado", "tesouro", "embaixada"],
  militar: ["base_militar", "navio_guerra", "aviao_militar", "pentagono"],
  justica: ["tribunal_fachada", "martelo_juiz", "balanca", "prisao"],
  seguranca: ["viatura_policia", "fita_isolamento", "camera_vigilancia", "fronteira_muro"],
  aviacao: ["aeroporto_terminal", "aviao_decolando", "torre_controle", "pista"],
  transporte: ["trem", "metro", "onibus", "rodovia", "ponte"],
  viagem: ["mala", "hotel", "praia", "cruzeiro"],
  cidades_eua: ["nova_york", "miami", "los_angeles", "chicago", "washington_dc", "las_vegas", "san_francisco", "orlando"],
  marcos_eua: ["estatua_liberdade", "golden_gate", "monumento_washington", "monte_rushmore"],
  paisagem_eua: ["grand_canyon", "parque_nacional", "deserto", "montanha", "lago"],
  clima: ["furacao", "tempestade", "enchente", "incendio_florestal", "neve", "seca"],
  agricultura: ["plantacao", "trator", "gado", "colheita", "celeiro"],
  alimentacao: ["hamburguer", "cafe", "mercado_produtores", "restaurante_salao", "cozinha"],
  cultura: ["museu", "teatro", "cinema_sala", "palco_show", "galeria_arte"],
  esporte: ["estadio", "quadra_basquete", "campo_futebol_americano", "bola", "academia"],
  entretenimento: ["videogame", "tv_sala", "fone_musica", "parque_diversoes"],
  religiao: ["igreja", "catedral", "templo", "vitral"],
  midia: ["microfone", "camera_tv", "estudio_podcast"],
  redes_sociais: ["celular_maos", "teclado", "tela_apagada"],
  cripto: ["bitcoin_moeda", "mineracao_servidores"],
  industria: ["siderurgia", "linha_montagem", "robo_industrial", "galpao"],
  logistica: ["caminhao", "centro_distribuicao", "drone_entrega", "caixas_papelao"],
  meio_ambiente: ["floresta", "reciclagem", "chamine", "oceano"],
  brasil_politica: ["congresso_nacional", "planalto", "stf", "esplanada"],
  brasil_economia: ["notas_real", "avenida_paulista", "porto_santos", "bolsa_b3"],
  brasil_cidades: ["sao_paulo", "rio_de_janeiro", "brasilia", "rodovia"],
  /*
   * Retrato é da pessoa, onde quer que tenha sido feito: a régua de país não
   * vale aqui (decisão de 29/09/2026). E este grupo NÃO entra no cardápio do
   * modelo, porque pessoa não é cena: retrato só sai do acervo pela ENTIDADE,
   * com o nome no campo `assunto` do arquivo.
   */
  pessoas: [],
} as const satisfies Record<string, readonly string[]>;

export type GrupoDoAcervo = keyof typeof CATALOGO_DE_CENAS;

/** O grupo cujo país não é régua. */
export const GRUPO_DE_RETRATOS: GrupoDoAcervo = "pessoas";

export const GRUPOS_DO_ACERVO = Object.keys(CATALOGO_DE_CENAS) as GrupoDoAcervo[];

/**
 * Os países da cobertura, como aparecem no nome do arquivo.
 *
 * Cena e lugar só entram destes dois. Cena de terceiro país é recusada na
 * ingestão (29/09/2026): o leitor vê "Estados Unidos" na peça, e uma rua de
 * Lisboa ilustrando moradia americana é uma afirmação falsa que ninguém
 * escreveu.
 */
export const PAISES_DA_COBERTURA = ["eua", "br"] as const;
export type PaisDaCobertura = (typeof PAISES_DA_COBERTURA)[number];

export function ehGrupo(valor: string): valor is GrupoDoAcervo {
  return Object.prototype.hasOwnProperty.call(CATALOGO_DE_CENAS, valor);
}

export function tagDe(grupo: string, assunto: string): string {
  return `${grupo}/${assunto}`;
}

/** Todas as tags que o modelo pode escolher, na ordem do catálogo. */
export const TAGS_DO_CATALOGO: readonly string[] = GRUPOS_DO_ACERVO.flatMap((g) =>
  (CATALOGO_DE_CENAS[g] as readonly string[]).map((a) => tagDe(g, a)),
);

const CONJUNTO_DE_TAGS = new Set(TAGS_DO_CATALOGO);

export function tagDoCatalogo(tag: string): boolean {
  return CONJUNTO_DE_TAGS.has(tag);
}

/**
 * O país da pauta traduzido para o código do arquivo.
 *
 * Sem país declarado, Estados Unidos: é o mesmo padrão da instrução da cena,
 * e a publicação cobre os EUA.
 */
export function paisDoAcervo(paisDaPauta: string | undefined | null): PaisDaCobertura {
  const t = (paisDaPauta ?? "").trim().toLowerCase();
  if (t === "brasil" || t === "brazil" || t === "br") return "br";
  return "eua";
}

/**
 * O cardápio como o modelo lê: um grupo por linha.
 *
 * Agrupado e não uma tag por linha porque são mais de 180 tags, e a linha por
 * grupo corta o prompt pela metade sem perder nenhuma.
 */
export function cardapioParaOModelo(): string {
  return GRUPOS_DO_ACERVO.filter((g) => CATALOGO_DE_CENAS[g].length > 0)
    .map((g) => `${g}/: ${(CATALOGO_DE_CENAS[g] as readonly string[]).join(", ")}`)
    .join("\n");
}
