import type { FotoDaCapa } from "../arte";

/**
 * O que o worker precisa achar numa linha do social-v2, e o que ele faz quando
 * não acha.
 *
 * O V2 chega ao worker PRONTO: a copy passou pelo Social Guard, a imagem foi
 * aprovada pelo resolvedor visual, e a arte é reproduzível a partir do que
 * ficou gravado. O worker não é um segundo autor — ele lê, confere, renderiza
 * pelo caminho determinístico e publica.
 *
 * Daí a assimetria deliberada deste módulo: ele não conserta nada. Faltando
 * qualquer peça obrigatória, ele devolve o que falta e o post não publica. A
 * alternativa seria o worker "completar" o que faltasse, e completar significa
 * gerar — exatamente o que o V2 existe para não fazer.
 */

export const GERACAO_V2 = "social-v2";

/** Vai no `error_message`, na mesma convenção de `PUBLICAÇÃO INCERTA:`. */
export const MOTIVO_CARGA_INCOMPLETA = "SOCIAL_V2_PAYLOAD_INCOMPLETE";

/** Outro giro pegou a mesma vaga primeiro. Não é falha: é a disputa resolvida. */
export const MOTIVO_VAGA_DISPUTADA = "SOCIAL_V2_SLOT_TAKEN";

/**
 * Versão de geração escrita, mas não reconhecida.
 *
 * O caso perigoso não é o valor errado, é para onde ele cai. `generation_version`
 * vazia significa post legado, e o ramo legado REGENERA a copy. Então um
 * `social_v2` com underscore, ou um `social-v3` de amanhã, cairia no caminho
 * que destrói o conteúdo aprovado — o pior desfecho possível para um erro de
 * digitação.
 */
export const MOTIVO_VERSAO_DESCONHECIDA = "SOCIAL_V2_UNKNOWN_GENERATION";

/** O que a linha precisa ter para publicar sem regenerar nada. */
export type CargaV2 = {
  /** Manchete da arte. Vem da coluna `title`, imutável a partir daqui. */
  headline: string;
  /** Legenda final, com hashtags já embutidas pelo Social Guard. */
  legenda: string;
  hashtags: string[];
  /** Sobrancelha da capa de texto. String vazia é válida: significa "sem eixo". */
  eixo: string;
  /** A foto aprovada, ou null quando a decisão foi capa de texto. */
  foto: FotoDaCapa | null;
  /** Por que não há foto. Só faz sentido quando `foto` é null. */
  motivoSemFoto: string;
  storyId: string;
  eventFingerprint: string | null;
  visualAssetId: string | null;
  originChannel: string;
};

/** A linha, como o worker a lê do banco. */
export type LinhaDePost = {
  generation_version?: unknown;
  dry_run?: unknown;
  title?: unknown;
  caption?: unknown;
  story_id?: unknown;
  event_fingerprint?: unknown;
  visual_asset_id?: unknown;
  origin_channel?: unknown;
  social_guard_status?: unknown;
  content_json?: unknown;
};

/**
 * Este post foi gerado pelo pipeline V2.
 *
 * A pergunta é feita pela coluna, não pela forma do `content_json`: adivinhar
 * pelo conteúdo faria uma linha legada com as chaves parecidas entrar no ramo
 * novo, e uma linha V2 com uma chave a menos cair no ramo antigo, que
 * regeneraria tudo. A coluna é declaração explícita de quem gravou.
 *
 * A comparação ignora caixa e espaço porque o custo dos dois lados é
 * assimétrico: reconhecer um `SOCIAL-V2` a mais não faz mal nenhum, e deixar
 * de reconhecer joga o post no ramo que reescreve a copy aprovada.
 */
export function ehSocialV2(linha: LinhaDePost): boolean {
  return normalizarVersao(linha) === GERACAO_V2;
}

function normalizarVersao(linha: LinhaDePost): string {
  return String(linha.generation_version ?? "").trim().toLowerCase();
}

/**
 * Post legado é o que NÃO declara versão nenhuma.
 *
 * Esta é a outra metade de `ehSocialV2`, e ela existe porque "não é V2" e "é
 * legado" não são a mesma coisa. Uma linha com `generation_version = social_v3`
 * não é V2, e tratá-la como legada a mandaria para o gerador antigo, que
 * reescreveria tudo. Versão escrita e não reconhecida tem que parar, não seguir.
 */
export function ehLegado(linha: LinhaDePost): boolean {
  return normalizarVersao(linha) === "";
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Ensaio não vai ao ar, e isto é conferido ANTES de tudo.
 *
 * `lerCargaV2` roda depois da reconciliação com a Meta, que pode republicar um
 * container de uma tentativa anterior. Uma linha marcada como ensaio que, por
 * qualquer motivo, tenha um container registrado seria publicada por esse
 * caminho sem passar por nenhuma guarda do V2. A pergunta é barata e a resposta
 * não depende de mais nada, então ela vem primeiro.
 */
export function ehEnsaio(linha: LinhaDePost): boolean {
  return linha.dry_run !== false;
}

export type LeituraDaCarga =
  | { ok: true; carga: CargaV2 }
  | { ok: false; faltando: string[]; motivo: string };

/**
 * Lê e confere a carga. Não completa, não deduz, não gera.
 *
 * O que é exigido, e por quê:
 *
 *   - `title` e `caption`: são a manchete e a legenda aprovadas. Sem elas não
 *     existe post, e reconstruí-las é gerar.
 *   - `hashtags`: o Social Guard as tornou obrigatórias. Uma linha V2 sem
 *     hashtag não passou pela guarda que diz que passou.
 *   - `content_json.arte`: o bloco que registra COMO a peça foi desenhada.
 *     Exigir o bloco, e não o eixo dentro dele, é o que separa "eixo ausente
 *     do registro" de "eixo registrado como nenhum" — o segundo é uma decisão
 *     editorial legítima e imprime uma peça sem sobrancelha.
 *   - `content_json.visual`: ou uma foto com URL, ou a decisão explícita de
 *     capa de texto. A ausência das duas é registro incompleto, não capa de
 *     texto por omissão.
 *   - `social_guard_status = passed`: post que a guarda reprovou não publica,
 *     por mais completo que o resto esteja.
 *   - `dry_run = false`: ensaio não vai ao ar. O worker legado ignora esta
 *     coluna, e é justamente por isso que o V2 a confere.
 */
export function lerCargaV2(linha: LinhaDePost): LeituraDaCarga {
  const faltando: string[] = [];

  /*
   * A única guarda que poderia falhar ABERTA, e o default do banco é o valor
   * perigoso.
   *
   * A coluna é `dry_run boolean not null default true`. Escrito como
   * `=== true`, um `undefined` — coluna fora do select, coluna fora do schema,
   * linha vinda de outro caminho — apagaria a guarda em silêncio e publicaria
   * um ensaio. Exigir `false` explicitamente inverte o erro para o lado que
   * não põe nada no ar.
   */
  if (ehEnsaio(linha)) {
    const bruto = linha.dry_run;
    faltando.push(
      `dry_run=${typeof bruto === "string" ? `"${bruto}"` : String(bruto)} (${typeof bruto}): ` +
        `só publica com o booleano false`,
    );
  }

  const guarda = texto(linha.social_guard_status);
  if (guarda !== "passed") {
    faltando.push(`social_guard_status=${guarda || "vazio"}: só publica o que a guarda aprovou`);
  }

  const headline = texto(linha.title);
  if (!headline) faltando.push("title");

  const legenda = typeof linha.caption === "string" ? linha.caption : "";
  if (!legenda.trim()) faltando.push("caption");

  const storyId = texto(linha.story_id);
  if (!storyId) faltando.push("story_id");

  const conteudo = objeto(linha.content_json);
  if (!conteudo) faltando.push("content_json");

  const hashtags = Array.isArray(conteudo?.hashtags)
    ? (conteudo!.hashtags as unknown[]).map((h) => texto(h)).filter(Boolean)
    : [];
  if (hashtags.length === 0) faltando.push("content_json.hashtags");

  const arte = objeto(conteudo?.arte);
  if (!arte) faltando.push("content_json.arte");

  const visual = objeto(conteudo?.visual);
  if (!visual) faltando.push("content_json.visual");

  /*
   * Foto ou capa de texto, e a diferença tem que estar escrita.
   *
   * `capa: "texto"` é o registro de que o resolvedor rodou e não achou imagem
   * publicável, com o motivo do lado. Sem foto E sem essa marca, o que existe
   * é uma linha pela metade, e publicar assim seria adivinhar qual dos dois
   * casos era.
   */
  const urlDaFoto = texto(visual?.imageUrl);
  const capaDeTexto = texto(visual?.capa) === "texto";
  let foto: FotoDaCapa | null = null;

  if (urlDaFoto && capaDeTexto) {
    /*
     * Os dois ao mesmo tempo é registro contraditório, e ele bloqueia.
     *
     * A primeira versão disto resolvia pela foto, com o argumento de que a foto
     * é o que foi aprovado. Só que a mesma linha afirma que a decisão foi capa
     * de texto: uma das duas informações está errada, e escolher qual é
     * adivinhar. É a mesma disciplina da variante logo abaixo, e não faria
     * sentido bloquear lá e adivinhar aqui.
     */
    faltando.push(
      `content_json.visual tem imageUrl E capa="texto" ao mesmo tempo: ` +
        `o registro se contradiz sobre a peça que foi aprovada`,
    );
  } else if (urlDaFoto) {
    foto = { imageUrl: urlDaFoto, attribution: texto(visual?.attribution) };
  } else if (!capaDeTexto && visual) {
    faltando.push("content_json.visual: nem imageUrl nem capa=texto");
  }

  /*
   * A variante gravada tem que concordar com a foto gravada.
   *
   * `content_json.arte.variante` estava sendo escrita e nunca lida — dado morto,
   * que é pior que dado ausente, porque parece uma conferência. Ela serve para
   * exatamente uma coisa: pegar linha internamente contraditória.
   *
   * O caso concreto: a linha diz `fullbleed_portrait`, que é a peça com foto de
   * fundo, e o registro visual não tem `imageUrl`. Uma das duas informações
   * está errada, e publicar significaria escolher qual — que é adivinhar.
   */
  if (arte) {
    const variante = texto(arte.variante);
    const esperada = foto ? "fullbleed_portrait" : "noticia_sem_foto";
    if (variante && variante !== esperada) {
      faltando.push(
        `content_json.arte.variante="${variante}" contradiz o registro visual ` +
          `(${foto ? "tem foto" : "sem foto"}, seria "${esperada}")`,
      );
    }
  }

  if (faltando.length > 0) {
    return {
      ok: false,
      faltando,
      motivo: `${MOTIVO_CARGA_INCOMPLETA}: ${faltando.join("; ")}`,
    };
  }

  return {
    ok: true,
    carga: {
      headline,
      legenda,
      hashtags,
      eixo: texto(arte!.eixo),
      foto,
      motivoSemFoto: foto ? "" : texto(visual!.motivo) || "NO_VALID_VISUAL_ASSET",
      storyId,
      eventFingerprint: texto(linha.event_fingerprint) || null,
      visualAssetId: texto(linha.visual_asset_id) || null,
      originChannel: texto(linha.origin_channel) || "social",
    },
  };
}
