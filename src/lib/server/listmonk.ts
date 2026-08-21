type EnvLike = Record<string, string | undefined>;

type NewsletterLead = {
  email: string;
  source: string;
};

const homesiteListUuid = "7c3535ab-988f-4c98-88c0-b73be3b9a90b";

export type ListmonkConfig =
  | { enabled: false }
  | {
      enabled: true;
      mode: "form";
      url: string;
      formListUuid: string;
    }
  | {
      enabled: true;
      mode: "api";
      url: string;
      token: string;
      listIds: number[];
    };

export function getListmonkConfig(env: EnvLike = process.env): ListmonkConfig {
  const url = env.LISTMONK_URL?.replace(/\/$/, "");
  const formListUuid = env.LISTMONK_FORM_LIST_UUID || homesiteListUuid;
  const token = env.LISTMONK_API_TOKEN;
  const listIds = String(env.LISTMONK_DEFAULT_LIST_ID ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!url) {
    return { enabled: false };
  }

  if (formListUuid) {
    return { enabled: true, mode: "form", url, formListUuid };
  }

  if (!token || listIds.length === 0) {
    return { enabled: false };
  }

  return { enabled: true, mode: "api", url, token, listIds };
}

export function buildListmonkFormPayload(lead: NewsletterLead, formListUuid = homesiteListUuid) {
  const payload = new URLSearchParams();
  payload.set("nonce", "");
  payload.set("email", lead.email.trim().toLowerCase());
  payload.set("l", formListUuid);

  return payload;
}

export function buildListmonkSubscriberPayload(lead: NewsletterLead, listIds: number[]) {
  return {
    email: lead.email.trim().toLowerCase(),
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

      if (config.mode === "form") {
        const response = await fetcher(`${config.url}/subscription/form`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: buildListmonkFormPayload(lead, config.formListUuid),
        });

        if (!response.ok) {
          return { ok: false as const, skipped: false as const, reason: "listmonk_form_request_failed" };
        }

        return { ok: true as const, id: undefined };
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
