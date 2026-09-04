import { getOpenReplyServiceConfig } from "../env";

/**
 * Cliente do fork mínimo do OpenReply (D1 em docs/sistema-prompt-arquitetura.md).
 *
 * A rota `POST /api/service/automations` ainda não existe do lado do
 * OpenReply — isso faz parte do trabalho de lá, fora do escopo deste repo.
 * Este cliente implementa o contrato já documentado (seção "Contrato csltia
 * ↔ OpenReply"), pronto pra testar assim que a rota existir. Até lá, toda
 * chamada real falha com 404 ou erro de rede — esperado, não bug daqui.
 */

export type CreateAutomationParams = {
  keyword: string;
  /**
   * Post ao qual a automação responde.
   *
   * Omitido, o OpenReply cria a automação com `matchAnyPost`: a palavra passa
   * a valer em qualquer publicação do perfil, para sempre. É o que o funil
   * permanente usa, e evita ter que criar uma automação por post (que a
   * checagem de colisão de keyword recusaria a partir da segunda).
   */
  postId?: string;
  dmMessage: string;
  openingDmMessage: string;
  trackedLink: { slug: string; destinationUrl: string };
  publicReplyMessages?: string[];
  requireFollow?: boolean;
  followUp?: { enabled: boolean; delayMinutes: number; message: string };
};

export type CreateAutomationResult = {
  automationId: string;
  trackedLinkUrl: string;
};

export class OpenReplyRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenReplyRequestError";
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Uma resposta de erro pode ser a página 404 inteira do Next do OpenReply
 * (rota de serviço ainda não existe lá) — não faz sentido despejar esse HTML
 * inteiro na mensagem de erro do admin.
 */
function summarizeErrorBody(body: string, status: number): string {
  const trimmed = body.trim();
  if (!trimmed) return `HTTP ${status}, sem corpo na resposta.`;
  if (trimmed.startsWith("<") || trimmed.length > 200) {
    return `HTTP ${status} — resposta não é JSON (provavelmente a rota ainda não existe do lado do OpenReply).`;
  }
  return trimmed;
}

export async function isKeywordAvailableOnOpenReply(
  keyword: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const { baseUrl, token } = getOpenReplyServiceConfig();

  const res = await fetcher(`${baseUrl}/api/service/automations?keyword=${encodeURIComponent(keyword)}`, {
    method: "GET",
    headers: authHeaders(token),
  });

  if (res.status === 200) return true;
  if (res.status === 409) return false;

  const body = await res.text().catch(() => "");
  throw new OpenReplyRequestError(
    `Checagem de keyword no OpenReply falhou: ${summarizeErrorBody(body, res.status)}`,
    res.status,
  );
}

export async function createAutomation(
  params: CreateAutomationParams,
  fetcher: typeof fetch = fetch,
): Promise<CreateAutomationResult> {
  const { baseUrl, token } = getOpenReplyServiceConfig();

  const res = await fetcher(`${baseUrl}/api/service/automations`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenReplyRequestError(
      `Criação de automação no OpenReply falhou: ${summarizeErrorBody(body, res.status)}`,
      res.status,
    );
  }

  const data = await res.json();
  if (!data?.automationId || !data?.trackedLinkUrl) {
    throw new OpenReplyRequestError("Resposta do OpenReply sem automationId/trackedLinkUrl.", res.status);
  }

  return { automationId: data.automationId, trackedLinkUrl: data.trackedLinkUrl };
}
