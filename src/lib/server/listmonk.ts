type EnvLike = Record<string, string | undefined>;

type NewsletterLead = {
  email: string;
  source: string;
  name?: string;
};

export type ListmonkConfig =
  | { enabled: false }
  | {
      enabled: true;
      url: string;
      token: string;
      listIds: number[];
    };

export function getListmonkConfig(env: EnvLike = process.env): ListmonkConfig {
  const url = env.LISTMONK_URL?.replace(/\/$/, "");
  const token = env.LISTMONK_API_TOKEN;
  const listIds = String(env.LISTMONK_DEFAULT_LIST_ID ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!url || !token || listIds.length === 0) {
    return { enabled: false };
  }

  return { enabled: true, url, token, listIds };
}

export function buildListmonkSubscriberPayload(lead: NewsletterLead, listIds: number[]) {
  return {
    email: lead.email.trim().toLowerCase(),
    name: lead.name?.trim() ?? "",
    status: "enabled",
    lists: listIds,
    preconfirm_subscriptions: false,
    attribs: {
      source: lead.source,
      consent: "site_opt_in",
    },
  };
}

export function createListmonkClient(env: EnvLike = process.env, fetcher: typeof fetch = fetch) {
  const config = getListmonkConfig(env);

  return {
    async upsertSubscriber(lead: NewsletterLead) {
      if (!config.enabled) {
        return { ok: false as const, skipped: true as const, reason: "listmonk_not_configured" };
      }

      const response = await fetcher(`${config.url}/api/subscribers`, {
        method: "POST",
        headers: {
          Authorization: `token ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildListmonkSubscriberPayload(lead, config.listIds)),
      });

      if (!response.ok) {
        return { ok: false as const, skipped: false as const, reason: "listmonk_request_failed" };
      }

      const body = (await response.json().catch(() => ({}))) as { data?: { id?: number } };
      return { ok: true as const, id: body.data?.id };
    },
  };
}
