/**
 * Vocabulário da resolução de imagem.
 *
 * Separado da implementação porque o Instagram vai consumir os mesmos tipos, e
 * dois sistemas de busca de imagem no mesmo projeto é como a newsletter e o
 * portal acabaram com dois caminhos de foto diferentes na fase 1.
 */

export type TipoDeEntidade =
  | "person"
  | "politician"
  | "public_official"
  | "institution"
  | "government_agency"
  | "company"
  | "place"
  | "event"
  | "conceptual";

/**
 * Pessoa é tratada diferente de tudo.
 *
 * Foto conceitual no lugar de uma pessoa é a mentira mais fácil de cometer:
 * matéria sobre Trump ilustrada com a Casa Branca sugere que a Casa Branca é o
 * assunto. Para estes tipos, banco de imagem não substitui.
 */
export const TIPOS_DE_PESSOA: TipoDeEntidade[] = ["person", "politician", "public_official"];

export function ehPessoa(tipo: TipoDeEntidade): boolean {
  return TIPOS_DE_PESSOA.includes(tipo);
}

/**
 * O que a foto representa, e o que ela NÃO representa.
 *
 * A distinção existe por um risco editorial: uma foto real do Trump é correta
 * numa matéria sobre o Trump e quase nunca foi tirada no acontecimento que a
 * matéria narra. `exact_event` exige prova de que a imagem é DAQUELE fato, e
 * nós não temos como provar isso com material de arquivo. Então nada é
 * classificado assim, e nenhuma legenda sugere que a foto é do fato narrado.
 */
export type TipoDeContextoDaImagem =
  | "exact_event"
  | "entity_portrait"
  | "official_portrait"
  | "institution"
  | "place"
  | "company"
  | "conceptual";

export type EntidadeVisual = {
  /** Nome como será buscado. */
  nome: string;
  /** Nome normalizado, chave da biblioteca. */
  normalizado: string;
  tipo: TipoDeEntidade;
  /** Identificador no Wikidata, quando resolvido. */
  qid: string | null;
  /** Arquivo da imagem principal declarada pelo Wikidata (P18). */
  imagemPrincipal: string | null;
  /** Categoria no Commons (P373), o caminho mais preciso de busca. */
  categoriaCommons: string | null;
  /** Site oficial (P856), ponto de partida da fonte oficial. */
  siteOficial: string | null;
  /** Como esta entidade foi escolhida entre as candidatas. */
  origem: string;
  /**
   * Quanta certeza existe de que é esta entidade, de 0 a 100.
   *
   * Existe porque "Washington" resolvido sem contexto e "Washington" resolvido
   * com a embaixada citada na matéria não valem a mesma coisa, e a decisão de
   * publicar depende disso.
   */
  confianca: number;
  /** O que sustentou a escolha. Nunca uma caixa-preta que diz só o nome. */
  evidencias: string[];
};

export type FonteDeImagem =
  | "wikimedia_commons"
  | "fonte_oficial"
  | "press_kit"
  | "flickr_commons"
  | "banco_conceitual"
  | "biblioteca_interna";

export type StatusDeDireitos = "verified" | "unknown" | "revoked" | "needs_review";

export type AssetVisual = {
  id?: string;
  entityName: string;
  entityNormalized: string;
  entityType: TipoDeEntidade;
  source: FonteDeImagem;
  /** Identificador do arquivo na origem. No Commons, o nome do arquivo. */
  sourceAssetId: string;
  imageUrl: string;
  /** Página que descreve o arquivo e prova a licença. Nunca vazia. */
  sourcePageUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  rightsStatement: string;
  rightsStatus: StatusDeDireitos;
  rightsCheckedAt: string;
  sourceLastCheckedAt: string;
  width: number;
  height: number;
  mimeType: string;
  storagePath: string | null;
  perceptualHash: string | null;
  imageRelevanceScore: number;
  /** Ano da obra, quando o acervo declara um. */
  assetDate?: number | null;
  assetAgeYears?: number | null;
  temporalRelevanceScore?: number;
  semanticContextFit?: number;
  archiveImage?: boolean;
  historicalEventSpecific?: boolean;
  /** O que a imagem representa. Nunca `exact_event` sem prova, e não temos. */
  imageContextType: TipoDeContextoDaImagem;
  /** Confiança e evidência da entidade que gerou esta escolha. */
  entityConfidence?: number;
  entityEvidence?: string[];
  metadata: Record<string, unknown>;
};

/** Por que uma pauta ficou sem imagem. Vai para o log e para o relatório. */
export const MOTIVOS_DE_RECUSA = {
  SEM_IMAGEM_DA_ENTIDADE: "NO_ENTITY_IMAGE_FOUND",
  LICENCA_DESCONHECIDA: "LICENSE_UNKNOWN",
  USADA_RECENTEMENTE: "RECENTLY_USED",
  RELEVANCIA_BAIXA: "LOW_RELEVANCE",
  RESOLUCAO_BAIXA: "LOW_RESOLUTION",
  FONTE_NAO_PERMITIDA: "SOURCE_NOT_ALLOWED",
  FALHA_AO_BUSCAR: "IMAGE_FETCH_FAILED",
  /** Duas entidades plausíveis e nenhum contexto para decidir. */
  ENTIDADE_AMBIGUA: "AMBIGUOUS_ENTITY",
  /** Registro de um acontecimento específico e antigo, que não é o da pauta. */
  EVENTO_HISTORICO_DIVERGENTE: "HISTORICAL_EVENT_MISMATCH",
  /** A imagem carrega sentido oposto ao da pauta no mesmo eixo. */
  CONTEXTO_SEMANTICO_DIVERGENTE: "SEMANTIC_CONTEXT_MISMATCH",
  /** Imagem de outro ciclo em pauta de indicador. */
  DESATUALIZADA: "TEMPORAL_MISMATCH",
  /** Retrato de figura pública que aparece na pauta e não é o assunto dela. */
  FIGURA_NAO_CENTRAL: "NON_CENTRAL_PUBLIC_FIGURE",
  SEM_IMAGEM_VALIDA: "NO_VALID_IMAGE",
} as const;

export type MotivoDeRecusa = (typeof MOTIVOS_DE_RECUSA)[keyof typeof MOTIVOS_DE_RECUSA];

export type CandidatoRecusado = {
  origem: FonteDeImagem;
  identificacao: string;
  motivo: MotivoDeRecusa;
  detalhe: string;
};

export type ResultadoVisual = {
  storyId: string;
  entidade: EntidadeVisual | null;
  asset: AssetVisual | null;
  status: "SELECTED" | "NO_VALID_IMAGE";
  motivo: MotivoDeRecusa | null;
  /** Quais fontes foram efetivamente consultadas, na ordem. */
  fontesConsultadas: Array<{ fonte: FonteDeImagem | "biblioteca_interna"; encontrados: number; nota: string }>;
  recusados: CandidatoRecusado[];
  /** Legenda a renderizar embaixo da foto, vazia quando a licença não exige. */
  legenda: string;
};

export function normalizarEntidade(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
