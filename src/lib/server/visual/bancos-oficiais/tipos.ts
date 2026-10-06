/**
 * O vocabulário dos bancos de imagem oficiais (06/10/2026).
 *
 * Cada banco fala a sua língua (JSON do Flickr, HTML da Agência Brasil, o
 * formato próprio da Câmara), e cada adaptador traduz para `FotoDoBanco`. Daqui
 * para a frente, licença, crédito e pontuação são uma régua só: é a lição da
 * "mesma regra em três cópias", e o motivo de nenhum adaptador montar crédito
 * nem decidir licença sozinho.
 */

export type IdDoBanco =
  | "agencia_brasil"
  | "camara"
  | "senado"
  | "planalto"
  | "stf"
  | "agencia_gov"
  | "casa_branca"
  | "federal_reserve"
  | "dvids"
  | "nasa"
  | "congresso_eua";

export type PaisDoBanco = "BR" | "US";

/** Uma foto como o banco a descreve, antes de qualquer decisão nossa. */
export type FotoDoBanco = {
  banco: IdDoBanco;
  /** Identificador estável na origem (id do Flickr, nid da Agência Brasil...). */
  id: string;
  titulo: string;
  /** A legenda do próprio banco. É nela que mora a prova de quem está na foto. */
  descricao: string;
  /** O maior arquivo que o banco serve. */
  imageUrl: string;
  /** A página da foto, onde autor e licença estão. Nunca vazia. */
  paginaUrl: string;
  /** Só o nome de quem fotografou, sem o nome do banco. */
  autor: string;
  /** Data da foto em ISO (AAAA-MM-DD), quando o banco declara. */
  data: string | null;
  largura: number;
  altura: number;
  /** A licença como o banco a declara, em texto que `avaliarLicenca` lê. */
  licenca: string;
  /** Página que prova a licença. */
  licencaUrl: string;
};

export type BuscaNoBanco = {
  fotos: FotoDoBanco[];
  /** O que foi pedido e o que veio, para `fontesConsultadas`. */
  nota: string;
};

export type DefinicaoDoBanco = {
  id: IdDoBanco;
  /** Como o banco assina o crédito: "Agência Brasil", "Câmara dos Deputados". */
  nome: string;
  pais: PaisDoBanco;
  /** Hosts de onde as imagens vêm. Todos precisam estar no `next.config.ts`. */
  hostsDeImagem: string[];
  /** Precisa de chave? Sem ela o banco é pulado com nota, nunca com erro. */
  chave?: string;
  buscar: (consulta: string, opcoes: OpcoesDaBusca) => Promise<BuscaNoBanco>;
};

export type OpcoesDaBusca = {
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Quantas fotos trazer, no máximo. */
  quantos: number;
  /** Só para teste: sem espera entre pedidos. */
  espaco?: number;
};
