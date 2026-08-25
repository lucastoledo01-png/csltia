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
  const rawUrl = env.LISTMONK_URL;
  if (!rawUrl || rawUrl.trim().length === 0) {
    return { enabled: false };
  }

  const url = rawUrl.replace(/\/$/, "");
  const formListUuid = env.LISTMONK_FORM_LIST_UUID || homesiteListUuid;
  const token = env.LISTMONK_API_TOKEN || env.LISTMONK_PASSWORD;
  const user = env.LISTMONK_API_USER || env.LISTMONK_KEY_ID || env.LISTMONK_USERNAME || "admin";
  const listIds = String(env.LISTMONK_DEFAULT_LIST_ID ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (env.LISTMONK_FORM_LIST_UUID && !env.LISTMONK_FORCE_API) {
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

  if (!token) {
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

  return { enabled: true, mode: "api", url, token, user, listIds: listIds.length > 0 ? listIds : [1] };
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

  function getAuthHeaders(): string[] {
    if (!config.enabled || !config.token) return [];

    const token = config.token.trim();
    const user = (config.user || "admin").trim();

    return [
      `token ${user}:${token}`,
      `token ${token}`,
      `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
      `Bearer ${token}`,
    ];
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

      const authHeaders = getAuthHeaders();
      let lastErr = "";

      for (const authHeader of authHeaders) {
        const response = await fetcher(`${config.url}/api/subscribers`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildListmonkSubscriberPayload(lead, config.listIds)),
        });

        if (response.ok) {
          const body = (await response.json().catch(() => ({}))) as { data?: { id?: number } };
          return { ok: true as const, id: body.data?.id };
        }

        lastErr = await response.text().catch(() => "");
      }

      return { ok: false as const, skipped: false as const, reason: `listmonk_request_failed: ${lastErr}` };
    },

    async createCampaign(campaign: ListmonkCampaignPayload) {
      if (!config.enabled || !config.token) {
        console.warn("[LISTMONK] API Token/Senha do Listmonk não configurado em LISTMONK_API_TOKEN ou LISTMONK_PASSWORD.");
        return { ok: false as const, skipped: true as const, reason: "listmonk_api_not_configured" };
      }

      const authHeaders = getAuthHeaders();
      let lastStatus = 0;
      let lastErrText = "";

      for (const authHeader of authHeaders) {
        try {
          console.log(`[LISTMONK] Tentando criar campanha em ${config.url}/api/campaigns com header '${authHeader.slice(0, 20)}...'`);
          const response = await fetcher(`${config.url}/api/campaigns`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
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

          if (response.ok) {
            const body = (await response.json().catch(() => ({}))) as { data?: { id?: number } };
            const campaignId = body.data?.id;

            if (campaign.autoSend && campaignId) {
              const statusRes = await fetcher(`${config.url}/api/campaigns/${campaignId}/status`, {
                method: "PUT",
                headers: {
                  Authorization: authHeader,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: "running" }),
              });

              if (!statusRes.ok) {
                const statusErr = await statusRes.text().catch(() => "");
                console.error(`[LISTMONK AUTO SEND ERROR] ${statusRes.status}: ${statusErr}`);
              } else {
                console.log(`[LISTMONK AUTO SEND] Campanha #${campaignId} disparada automaticamente com sucesso!`);
              }
            }

            return { ok: true as const, id: campaignId, status: campaign.autoSend ? "running" : "draft" };
          }

          lastStatus = response.status;
          lastErrText = await response.text().catch(() => "");
          console.warn(`[LISTMONK AUTH TRY FAILED] ${response.status}: ${lastErrText}`);
        } catch (err: any) {
          console.error("[LISTMONK CAMPAIGN FETCH ERROR]", err);
          lastErrText = err?.message || String(err);
        }
      }

      return { ok: false as const, skipped: false as const, reason: `listmonk_campaign_failed_${lastStatus}: ${lastErrText}` };
    },
  };
}
