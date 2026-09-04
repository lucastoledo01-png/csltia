export type MetaAccountInfo = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

export type MetaPublishItemResult = {
  ok: boolean;
  creationId?: string;
  error?: string;
};

export type MetaPublishCarouselResult = {
  ok: boolean;
  mediaId?: string;
  error?: string;
};

export function getMetaConfig(env: Record<string, string | undefined> = process.env) {
  const accountId = env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();

  return {
    accountId,
    accessToken,
    isConfigured: Boolean(accountId && accessToken && accountId.length > 0 && accessToken.length > 0),
  };
}

export async function verifyMetaInstagramCredentials(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ ok: boolean; account?: MetaAccountInfo; error?: string }> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de INSTAGRAM_ACCOUNT_ID ou INSTAGRAM_ACCESS_TOKEN não configuradas no ambiente." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetcher(url);
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errDetail = json.error?.message || response.statusText;
      return { ok: false, error: `Meta API error (${response.status}): ${errDetail}` };
    }

    return {
      ok: true,
      account: {
        id: json.id,
        username: json.username,
        name: json.name,
        profile_picture_url: json.profile_picture_url,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function createCarouselItemContainer(
  imageUrl: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
    const params = new URLSearchParams();
    params.set("image_url", imageUrl);
    params.set("is_carousel_item", "true");
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return { ok: false, error: json.error?.message || `Falha ao criar item de carrossel (${response.status})` };
    }

    return { ok: true, creationId: json.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Container de imagem única — post que não é carrossel.
 *
 * Difere do item de carrossel em duas coisas que precisam andar juntas: não
 * leva `is_carousel_item`, e a legenda vai aqui, porque não haverá container
 * pai para carregá-la. Mandar `is_carousel_item=true` num post solo cria uma
 * mídia que nunca aparece no feed — fica pendurada esperando um carrossel que
 * não vem.
 *
 * Usado pelo formato `noticia`, que é capa só.
 */
export async function createSingleImageContainer(
  imageUrl: string,
  caption: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
    const params = new URLSearchParams();
    params.set("image_url", imageUrl);
    params.set("caption", caption);
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return {
        ok: false,
        error: json.error?.message || `Falha ao criar container de imagem única (${response.status})`,
      };
    }

    return { ok: true, creationId: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createCarouselContainer(
  childrenIds: string[],
  caption: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
    const params = new URLSearchParams();
    params.set("media_type", "CAROUSEL");
    params.set("children", childrenIds.join(","));
    params.set("caption", caption);
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return { ok: false, error: json.error?.message || `Falha ao criar container de carrossel (${response.status})` };
    }

    return { ok: true, creationId: json.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Aguarda o container terminar de ser processado antes da publicacao.
 *
 * A Graph API processa midia de forma assincrona. O codigo publicava logo apos
 * criar o container, o que produz falha intermitente sem causa aparente quando
 * a Meta ainda nao terminou de baixar e validar as imagens.
 */
export async function waitForContainerReady(
  creationId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  const { accessToken, isConfigured } = getMetaConfig(env);
  if (!isConfigured || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const limite = Date.now() + timeoutMs;

  while (Date.now() < limite) {
    const url = `https://graph.facebook.com/v22.0/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetcher(url);
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: json.error?.message || `Falha ao consultar container (${response.status})` };
    }

    switch (json.status_code) {
      case "FINISHED":
        return { ok: true };
      case "ERROR":
        return { ok: false, error: json.status || "A Meta rejeitou a mídia do container." };
      case "EXPIRED":
        return { ok: false, error: "O container expirou antes da publicação." };
      default:
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { ok: false, error: `Container não ficou pronto em ${Math.round(timeoutMs / 1000)}s.` };
}

export async function publishContainer(
  creationId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<MetaPublishCarouselResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media_publish`;
    const params = new URLSearchParams();
    params.set("creation_id", creationId);
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return { ok: false, error: json.error?.message || `Falha ao publicar container no Instagram (${response.status})` };
    }

    return { ok: true, mediaId: json.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
