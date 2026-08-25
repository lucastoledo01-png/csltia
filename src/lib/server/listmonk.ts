type EnvLike = Record<string, string | undefined>;

type NewsletterLead = {
  email: string;
  source: string;
};

export type ListmonkCampaignPayload = {
  name: string;
  subject: string;
  body: string;
  listIds?: number[];
  sendAt?: string | null;
  autoSend?: boolean;
};

const homesiteListUuid = "7c3535ab-988f-4c98-88c0-b73be3b9a90b";

export type ListmonkConfig =
  | { enabled: false }
  | {
      enabled: true;
      mode: "form";
      url: string;
      formListUuid: string;
      token?: string;
      user?: string;
      listIds: number[];
    }
  | {
      enabled: true;
      mode: "api";
      url: string;
      token: string;
      user?: string;
      listIds: number[];
    };

export function getListmonkConfig(env: EnvLike = process.env): ListmonkConfig {
  const url = env.LISTMONK_URL?.replace(/\/$/, "");
  const formListUuid = env.LISTMONK_FORM_LIST_UUID || homesiteListUuid;
  const token = env.LISTMONK_API_TOKEN;
  const user = env.LISTMONK_API_USER;
  const listIds = String(env.LISTMONK_DEFAULT_LIST_ID ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!url) {
    return { enabled: false };
  }

  if (formListUuid) {
    return {
      enabled: true,
      mode: "form",
      url,
      formListUuid,
      token,
      user,
      listIds: listIds.length > 0 ? listIds : [1],
    };
  }

  if (!token || listIds.length === 0) {
    return { enabled: false };
  }

  return { enabled: true, mode: "api", url, token, user, listIds };
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

  function getAuthHeader(): string {
    if (config.enabled && config.token) {
      if (config.user) {
        const credentials = Buffer.from(`${config.user}:${config.token}`).toString("base64");
        return `Basic ${credentials}`;
      }
      return `token ${config.token}`;
    }
    return "";
  }

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
          Authorization: getAuthHeader(),
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

    async createCampaign(campaign: ListmonkCampaignPayload) {
      if (!config.enabled || !config.token) {
        console.warn("[LISTMONK] API Token do Listmonk não configurado para criação de campanhas.");
        return { ok: false as const, skipped: true as const, reason: "listmonk_api_not_configured" };
      }

      try {
        const response = await fetcher(`${config.url}/api/campaigns`, {
          method: "POST",
          headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: campaign.name,
            subject: campaign.subject,
            lists: campaign.listIds || config.listIds,
            type: "regular",
            content_type: "html",
            body: campaign.body,
            send_at: campaign.sendAt || null,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          console.error(`[LISTMONK CAMPAIGN ERROR] ${response.status}: ${errText}`);
          return { ok: false as const, skipped: false as const, reason: "listmonk_campaign_creation_failed" };
        }

        const body = (await response.json().catch(() => ({}))) as { data?: { id?: number } };
        const campaignId = body.data?.id;

        if (campaign.autoSend && campaignId) {
          await fetcher(`${config.url}/api/campaigns/${campaignId}/status`, {
            method: "PUT",
            headers: {
              Authorization: getAuthHeader(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "running" }),
          }).catch((err) => console.error("[LISTMONK AUTO SEND ERROR]", err));
          console.log(`[LISTMONK AUTO SEND] Campanha #${campaignId} disparada automaticamente!`);
        }

        return { ok: true as const, id: campaignId, status: campaign.autoSend ? "running" : "draft" };
      } catch (err: any) {
        console.error("[LISTMONK CAMPAIGN FETCH ERROR]", err);
        return { ok: false as const, skipped: false as const, reason: "listmonk_campaign_request_exception" };
      }
    },
  };
}
