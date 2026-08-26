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
