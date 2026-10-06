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
  | "openverse"
  | "banco_conceitual"
  | "biblioteca_interna"
  /**
   * O acervo próprio (decisão de 29/09/2026), consultado antes de qualquer
   * fonte externa. Fica separado de `biblioteca_interna` porque aquela guarda
   * o que veio de FORA e foi aprovado; este é o que nós produzimos.
   */
  | "acervo_proprio"
  /**
   * Os bancos de imagem oficiais (06/10/2026): Agência Brasil, Câmara,
   * Senado, Planalto, Casa Branca e afins. Qual deles está em
   * `metadata.banco`; o crédito curto, em `attribution`.
   */
  | "banco_oficial"
  /** A bandeira da publicação, quando nem o banco conceitual entregou nada. */
  | "ultimo_recurso";

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
  /**
   * O que a conferência visual VIU na imagem, e o quanto confiou.
   *
   * Fica separado do `semanticContextFit` de propósito: aquele mede ausência de
   * contradição de polaridade entre dois textos, e vale 100 no silêncio. Este
   * só existe quando alguém abriu a imagem.
   */
  conferenciaVisual?: {
    descricao: string;
    motivo: string;
    paisAparente: string | null;
    confianca: number;
  };
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
  /** Alguém olhou a foto e ela não sustenta a manchete. */
  CONFERENCIA_VISUAL_REPROVOU: "VISUAL_CHECK_FAILED",
  /** A conferência visual não pôde ser feita, e sem ela não se aprova. */
  CONFERENCIA_VISUAL_INDISPONIVEL: "VISUAL_CHECK_UNAVAILABLE",
  SEM_IMAGEM_VALIDA: "NO_VALID_IMAGE",
  /**
   * A manchete nomeia uma pessoa ou organização e nenhuma foto DELA passou na
   * verificação de identidade ou de marca (06/10/2026, "imagem certeira"). A
   * pauta não vira conteúdo: foto de cena no lugar do protagonista não existe.
   */
  FOTO_DO_PROTAGONISTA_NAO_VERIFICADA: "PROTAGONIST_PHOTO_NOT_VERIFIED",
  /** A foto não é, com certeza, da pessoa que a manchete nomeia. */
  IDENTIDADE_NAO_CONFERIDA: "IDENTITY_NOT_VERIFIED",
  /** A marca da organização que a manchete nomeia não está legível na imagem. */
  MARCA_NAO_CONFERIDA: "BRAND_NOT_VERIFIED",
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
  /**
   * A segunda melhor imagem aprovada, para a bolha da capa.
   *
   * Passou pelas mesmas barreiras da primeira: resolução, licença,
   * temporalidade, figura não central e piso de relevância. É nula quando só
   * uma candidata sobreviveu, e nesse caso a capa sai sem bolha, inteira.
   */
  assetSecundario: AssetVisual | null;
  status: "SELECTED" | "NO_VALID_IMAGE";
  motivo: MotivoDeRecusa | null;
  /** Quais fontes foram efetivamente consultadas, na ordem. */
  fontesConsultadas: Array<{ fonte: FonteDeImagem | "biblioteca_interna"; encontrados: number; nota: string }>;
  recusados: CandidatoRecusado[];
  /** Legenda a renderizar embaixo da foto, vazia quando a licença não exige. */
  legenda: string;
  /**
   * Por qual etapa a foto aprovada veio (06/10/2026).
   *
   * `cena_depois_da_entidade` é a pauta com entidade nomeada cuja foto da
   * entidade não passou, e que ganhou a foto da cena. O relatório precisa
   * separar as três: é o número que diz quanto a etapa da cena está salvando.
   * Ausente em resultado sem foto da pauta.
   */
  caminho?: CaminhoDaFoto;
  /**
   * Em qual degrau da escada da cena a foto foi achada (06/10/2026). Só existe
   * quando a foto veio da cena: o degrau diz quanto a busca precisou descer, e
   * `reuso` diz que a foto já tinha saído nos últimos 30 dias.
   */
  degrau?: DegrauDaCena;
  /**
   * O protagonista que a manchete nomeia, quando nomeia (06/10/2026). Com ele,
   * a foto é dele ou da marca dele, verificada, e nunca uma cena. A prova da
   * verificação fica em `asset.metadata.verificacao`.
   */
  protagonista?: { nome: string; tipo: TipoDeEntidade; qid: string | null } | null;
};

/**
 * Como a foto do protagonista foi provada (06/10/2026, "imagem certeira").
 * Vai para `asset.metadata.verificacao` e para `content_json.visual.verificacao`.
 */
export type VerificacaoDoProtagonista = {
  regra: "protagonista_da_manchete";
  protagonista: string;
  qid: string | null;
  /**
   * `identidade`: a pessoa da manchete, conferida contra o retrato de referência.
   * `marca`: foto com o nome da organização legível. `logotipo`: o cartão do
   * logotipo oficial (P154). `representante`: o CEO ou fundador (P169, P112),
   * com a identidade conferida.
   */
  tipo: "identidade" | "marca" | "logotipo" | "representante";
  /** De onde vem a certeza: retrato P18, legenda do banco oficial, comparação de rosto, texto lido. */
  como: string;
  referencia?: string | null;
  representante?: { nome: string; papel: string; qid: string } | null;
  veredicto?: { confianca: number; descricao: string; motivo: string; textoLido?: string };
};

export type CaminhoDaFoto = "entidade" | "cena" | "cena_depois_da_entidade";

/** Os degraus da escada da cena, na ordem em que são tentados. */
export type DegrauDaCena = "acervo" | "cena" | "cena_ampla" | "editoria" | "reuso";

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
