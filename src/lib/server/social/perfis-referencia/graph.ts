/**
 * Leitura de um perfil de referência pela Business Discovery da Graph API.
 *
 * Business Discovery lê os posts públicos de OUTRA conta profissional usando a
 * nossa conta como ponto de acesso, e funciona com o token que já publica. Foi
 * conferido contra a API real em 05/10/2026: `braziljournal` devolveu 200 com
 * seguidores, contagem de mídia e os posts com `like_count` e
 * `comments_count`.
 *
 * Toda falha vira um RESULTADO com status, e nunca uma exceção. O ciclo do
 * Instagram não pode morrer porque um perfil de referência virou conta
 * pessoal, e o motivo precisa ir para o banco (RNF-02), não para o log do
 * contêiner, que ninguém alcança.
 */

export type StatusDaLeitura =
  | "ok"
  /**
   * Conta pessoal, privada, inexistente ou com o nome trocado.
   *
   * A Meta devolve a MESMA resposta para os quatro casos, medido em
   * 05/10/2026: código 110, subcódigo 2207013, "Invalid user id", tanto para
   * uma conta pessoal quanto para um nome que não existe. Separar os quatro
   * aqui seria inventar uma distinção que a API não dá.
   */
  | "nao_encontrado_ou_nao_business"
  /** Limite de chamadas da Meta. Passa sozinho; não é configuração errada. */
  | "limite_da_api"
  /** Token vencido ou revogado. Quem conserta é o cron de renovação ou o dono. */
  | "token_invalido"
  /** O projeto não tem conta ou token do Instagram configurados. */
  | "sem_credencial"
  | "erro";

export type PostDoPerfil = {
  id: string;
  legenda: string;
  curtidas: number | null;
  comentarios: number;
  publicadoEm: string;
  tipo: string;
  permalink: string;
};

export type LeituraDoPerfil = {
  handle: string;
  status: StatusDaLeitura;
  httpStatus: number | null;
  codigoDeErro: number | null;
  subcodigoDeErro: number | null;
  mensagemDeErro: string | null;
  seguidores: number | null;
  posts: PostDoPerfil[];
};

/**
 * O nome de usuário como a Graph API aceita: minúsculo, sem arroba e sem URL.
 *
 * O operador cola o que tem na mão, e o que ele tem na mão costuma ser o link
 * do perfil. Devolve `null` quando não sobra um nome válido, e a rota do
 * painel recusa com 400 em vez de gravar algo que nunca vai ler.
 */
export function normalizarHandle(bruto: string): string | null {
  let t = String(bruto ?? "").trim().toLowerCase();
  const daUrl = t.match(/instagram\.com\/([^/?#]+)/);
  if (daUrl) t = daUrl[1];
  t = t.replace(/^@+/, "").replace(/\/+$/, "");
  // Regra do Instagram: letras, números, ponto e sublinhado, até 30.
  if (!/^[a-z0-9._]{1,30}$/.test(t)) return null;
  return t;
}

const CODIGOS_DE_LIMITE = new Set([4, 17, 32, 613, 80002]);

/**
 * Traduz o erro da Meta para um status que o painel e o ciclo entendem.
 *
 * Função pura e exportada porque é aqui que mora a decisão que mais importa
 * nesta leitura: o que é "o perfil não serve" contra "a API está ocupada".
 * Um exige o operador trocar o perfil; o outro só esperar.
 */
export function classificarErroDaGraph(
  httpStatus: number,
  erro: { code?: unknown; error_subcode?: unknown; message?: unknown } | null | undefined,
): StatusDaLeitura {
  const code = Number(erro?.code);
  const sub = Number(erro?.error_subcode);
  if (CODIGOS_DE_LIMITE.has(code) || httpStatus === 429) return "limite_da_api";
  if (code === 190) return "token_invalido";
  if (code === 110 || sub === 2207013) return "nao_encontrado_ou_nao_business";
  return "erro";
}

/** Corta e limpa a mensagem da Meta, e garante que nenhum token vaze por ela. */
function mensagemSegura(texto: unknown, token: string): string {
  let m = String(texto ?? "").slice(0, 300);
  if (token) m = m.split(token).join("[redigido]");
  return m;
}

const GRAPH = "https://graph.facebook.com/v22.0";

export async function lerPerfilPorBusinessDiscovery(
  handle: string,
  credencial: { accountId?: string; accessToken?: string },
  opcoes: { fetcher?: typeof fetch; limiteDePosts?: number; tempoLimiteMs?: number } = {},
): Promise<LeituraDoPerfil> {
  const vazio: LeituraDoPerfil = {
    handle,
    status: "erro",
    httpStatus: null,
    codigoDeErro: null,
    subcodigoDeErro: null,
    mensagemDeErro: null,
    seguidores: null,
    posts: [],
  };

  const accountId = credencial.accountId?.trim() ?? "";
  const token = credencial.accessToken?.trim() ?? "";
  if (!accountId || !token) {
    return { ...vazio, status: "sem_credencial", mensagemDeErro: "conta ou token do Instagram ausentes" };
  }

  const fetcher = opcoes.fetcher ?? fetch;
  // 25 é o bastante para uma linha de base estável sem pedir paginação: a
  // Business Discovery devolve 25 por página por padrão.
  const limite = Math.max(5, Math.min(opcoes.limiteDePosts ?? 25, 50));
  const campos =
    `business_discovery.username(${handle})` +
    `{username,followers_count,media.limit(${limite})` +
    `{id,caption,like_count,comments_count,timestamp,media_type,permalink}}`;
  const url = `${GRAPH}/${encodeURIComponent(accountId)}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(token)}`;

  let resposta: Response;
  try {
    resposta = await fetcher(url, { signal: AbortSignal.timeout(opcoes.tempoLimiteMs ?? 15_000) });
  } catch (e) {
    return { ...vazio, status: "erro", mensagemDeErro: mensagemSegura((e as Error)?.message, token) };
  }

  const json = (await resposta.json().catch(() => ({}))) as Record<string, any>;

  if (!resposta.ok || json?.error) {
    const erro = json?.error ?? {};
    return {
      ...vazio,
      status: classificarErroDaGraph(resposta.status, erro),
      httpStatus: resposta.status,
      codigoDeErro: Number.isFinite(Number(erro.code)) ? Number(erro.code) : null,
      subcodigoDeErro: Number.isFinite(Number(erro.error_subcode)) ? Number(erro.error_subcode) : null,
      mensagemDeErro: mensagemSegura(erro.message ?? resposta.statusText, token),
    };
  }

  const bd = json?.business_discovery ?? {};
  const dados = Array.isArray(bd?.media?.data) ? bd.media.data : [];
  const posts: PostDoPerfil[] = dados
    .filter((m: Record<string, unknown>) => m && typeof m.id === "string")
    .map((m: Record<string, unknown>) => ({
      id: String(m.id),
      legenda: String(m.caption ?? ""),
      // Dono do perfil pode esconder curtidas; aí o campo não vem. `null`, e
      // não zero, para a linha de base não tratar "escondido" como "ninguém
      // curtiu".
      curtidas: typeof m.like_count === "number" ? m.like_count : null,
      comentarios: typeof m.comments_count === "number" ? m.comments_count : 0,
      publicadoEm: String(m.timestamp ?? ""),
      tipo: String(m.media_type ?? ""),
      permalink: String(m.permalink ?? ""),
    }));

  return {
    ...vazio,
    status: "ok",
    httpStatus: resposta.status,
    seguidores: typeof bd.followers_count === "number" ? bd.followers_count : null,
    posts,
  };
}
